import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createConnectedMockZMKApp,
  ZMKAppProvider,
} from "@cormoran/zmk-studio-react-hook/testing";
import { HapticLabSection, SUBSYSTEM_IDENTIFIER } from "../src/App";
import {
  Request,
  Response,
} from "../src/proto/cormoran/drv2605l-lab/drv2605l_lab";

jest.mock("@zmkfirmware/zmk-studio-ts-client", () => ({
  create_rpc_connection: jest.fn(),
  call_rpc: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const zmkClient = require("@zmkfirmware/zmk-studio-ts-client");

function renderConnected() {
  const mockZMKApp = createConnectedMockZMKApp({
    subsystems: [SUBSYSTEM_IDENTIFIER],
  });
  render(
    <ZMKAppProvider value={mockZMKApp}>
      <HapticLabSection />
    </ZMKAppProvider>
  );
}

function customRequests(): Request[] {
  return zmkClient.call_rpc.mock.calls
    .map(
      ([, request]: [
        unknown,
        { custom?: { call?: { payload: Uint8Array } } },
      ]) => request.custom?.call?.payload
    )
    .filter(Boolean)
    .map((payload: Uint8Array) => Request.decode(payload));
}

beforeEach(() => {
  jest.clearAllMocks();
  zmkClient.call_rpc.mockImplementation(
    (
      _connection: unknown,
      request: { custom?: { call?: { payload: Uint8Array } } }
    ) => {
      if (!request.custom?.call)
        return Promise.resolve({ core: { getLockState: 2 } });
      const decoded = Request.decode(request.custom.call.payload);
      const response = decoded.getStatus
        ? Response.create({
            status: { present: true, ready: true, status: 0, errorCode: 0 },
          })
        : Response.create({ result: { errorCode: 0 } });
      return Promise.resolve({
        custom: { call: { payload: Response.encode(response).finish() } },
      });
    }
  );
});

it("loads status once and does not loop after the response renders", async () => {
  renderConnected();
  await screen.findByText("Bus: ready");
  expect(customRequests()).toHaveLength(1);
  expect(customRequests()[0].getStatus).toBeDefined();
  // Let the response-driven render and any queued effects settle. A codec or
  // callback identity loop would issue another status RPC during this pause.
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(customRequests()).toHaveLength(1);
});

it("plays selected ROM effect, stops, and refreshes status", async () => {
  renderConnected();
  await screen.findByText("Bus: ready");
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("ROM library"), "6");
  await user.clear(screen.getByLabelText("ROM effect (1–123)"));
  await user.type(screen.getByLabelText("ROM effect (1–123)"), "123");
  await user.click(screen.getByRole("button", { name: "Play" }));
  await screen.findByText("Play succeeded.");
  expect(customRequests()[1].play).toEqual({ library: 6, effect: 123 });
  await user.click(screen.getByRole("button", { name: "Stop" }));
  await screen.findByText("Stop succeeded.");
  expect(customRequests()[2].stop).toBeDefined();
  await user.click(screen.getByRole("button", { name: "Refresh status" }));
  await waitFor(() => expect(customRequests()).toHaveLength(4));
});

it("blocks invalid effects and reports firmware errors", async () => {
  zmkClient.call_rpc.mockImplementation(
    (
      _connection: unknown,
      request: { custom?: { call?: { payload: Uint8Array } } }
    ) => {
      if (!request.custom?.call)
        return Promise.resolve({ core: { getLockState: 2 } });
      const decoded = Request.decode(request.custom.call.payload);
      const response = decoded.getStatus
        ? Response.create({
            status: { present: false, ready: false, status: 0, errorCode: -19 },
          })
        : Response.create({ result: { errorCode: -22 } });
      return Promise.resolve({
        custom: { call: { payload: Response.encode(response).finish() } },
      });
    }
  );
  renderConnected();
  await screen.findByText("Bus: unavailable");
  expect(screen.getByText("Firmware error code: -19")).toBeInTheDocument();
  const user = userEvent.setup();
  const effect = screen.getByLabelText("ROM effect (1–123)");
  await user.clear(effect);
  await user.type(effect, "124");
  expect(screen.getByRole("button", { name: "Play" })).toBeDisabled();
  await user.clear(effect);
  await user.type(effect, "3");
  await user.click(screen.getByRole("button", { name: "Play" }));
  await screen.findByText("Play failed: firmware error -22.");
});

it("shows the missing subsystem warning", () => {
  const mockZMKApp = createConnectedMockZMKApp({ subsystems: [] });
  render(
    <ZMKAppProvider value={mockZMKApp}>
      <HapticLabSection />
    </ZMKAppProvider>
  );
  expect(
    screen.getByText(/Subsystem "cormoran__drv2605l_lab" not found/)
  ).toBeInTheDocument();
});

it("waits for GO to clear before the next effect and cancels without overlapping Stop", async () => {
  const events: string[] = [];
  let resolveSecondPlay: ((response: unknown) => void) | undefined;
  let pollCount = 0;
  zmkClient.call_rpc.mockImplementation(
    (
      _connection: unknown,
      request: { custom?: { call?: { payload: Uint8Array } } }
    ) => {
      if (!request.custom?.call)
        return Promise.resolve({ core: { getLockState: 2 } });
      const decoded = Request.decode(request.custom.call.payload);
      const encode = (response: Response) => ({
        custom: { call: { payload: Response.encode(response).finish() } },
      });
      if (decoded.getStatus) {
        pollCount++;
        events.push("status");
        // First request is the initial status load. The first sequence poll
        // reports GO=1, and the next reports GO=0.
        return Promise.resolve(
          encode(
            Response.create({
              status: {
                present: true,
                ready: true,
                status: 0,
                errorCode: 0,
                playing: pollCount === 2,
              },
            })
          )
        );
      }
      if (decoded.play) {
        events.push(`play:${decoded.play.effect}`);
        if (decoded.play.effect === 2) {
          return new Promise((resolve) => {
            resolveSecondPlay = resolve;
          });
        }
        return Promise.resolve(
          encode(Response.create({ result: { errorCode: 0 } }))
        );
      }
      if (decoded.stop) {
        events.push("stop");
        return Promise.resolve(
          encode(Response.create({ result: { errorCode: 0 } }))
        );
      }
      throw new Error("unexpected RPC");
    }
  );
  renderConnected();
  await screen.findByText("Bus: ready");
  const user = userEvent.setup();
  await user.selectOptions(screen.getByLabelText("ROM library"), "6");
  await user.click(screen.getByRole("button", { name: "Start sequence" }));
  await waitFor(() => expect(events).toContain("play:2"));
  expect(events).toEqual(["status", "play:1", "status", "status", "play:2"]);
  expect(
    customRequests()
      .filter((request) => request.play)
      .map((request) => request.play)
  ).toEqual([
    { library: 6, effect: 1 },
    { library: 6, effect: 2 },
  ]);
  await user.click(screen.getByRole("button", { name: "Stop" }));
  expect(events).not.toContain("stop");
  resolveSecondPlay?.({
    custom: {
      call: {
        payload: Response.encode(
          Response.create({ result: { errorCode: 0 } })
        ).finish(),
      },
    },
  });
  await screen.findByText("Sequence stopped.");
  expect(events).toEqual([
    "status",
    "play:1",
    "status",
    "status",
    "play:2",
    "stop",
  ]);
  await new Promise((resolve) => setTimeout(resolve, 75));
  expect(customRequests().filter((request) => request.play)).toHaveLength(2);
});

it("stops a sequence on a firmware Play error", async () => {
  zmkClient.call_rpc.mockImplementation(
    (
      _connection: unknown,
      request: { custom?: { call?: { payload: Uint8Array } } }
    ) => {
      if (!request.custom?.call)
        return Promise.resolve({ core: { getLockState: 2 } });
      const decoded = Request.decode(request.custom.call.payload);
      const response = decoded.getStatus
        ? Response.create({
            status: {
              present: true,
              ready: true,
              status: 0,
              errorCode: 0,
              playing: false,
            },
          })
        : Response.create({ result: { errorCode: -22 } });
      return Promise.resolve({
        custom: { call: { payload: Response.encode(response).finish() } },
      });
    }
  );
  renderConnected();
  await screen.findByText("Bus: ready");
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "Start sequence" }));
  await screen.findByText(
    "Sequence stopped: Play effect 1: firmware error -22"
  );
  expect(customRequests().filter((request) => request.play)).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Start sequence" })).toBeEnabled();
});
