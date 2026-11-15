import { useCallback, useContext, useEffect, useState } from "react";
import "./App.css";
import { connect as gattConnect } from "@zmkfirmware/zmk-studio-ts-client/transport/gatt";
import {
  ZMKConnection,
  ZMKAppContext,
  isWebSerialSupported,
  isWebBluetoothSupported,
  useCustomSubsystem,
  connectSerial,
} from "@cormoran/zmk-studio-react-hook";
import { Request, Response } from "./proto/cormoran/drv2605l-lab/drv2605l_lab";

export const SUBSYSTEM_IDENTIFIER = "cormoran__drv2605l_lab";

// useCustomSubsystem uses codec identity to memoize its call function.
const codec = {
  encode: (request: Request) => Request.encode(request).finish(),
  decode: Response.decode,
};

// Template placeholder: `scripts/init_module.py` rewrites this literal to
// `{owner}/{repo}`. Never write the full
// `...-with-custom-studio-rpc` repo name in a URL built from this constant --
// the replacement targets this exact string first, which would otherwise
// leave the owner unreplaced.
export const GITHUB_REPO = "cormoran/zmk-module-drv2605l-lab";

// Unlike GITHUB_REPO above, this always credits the original template
// project, regardless of which repo this module was forked into. The
// trailing comment is scripts/init_module.py's IGNORE_MARKER: it keeps this
// line from being rewritten (like GITHUB_REPO is) or flagged as a leftover
// placeholder once initialized.
export const TEMPLATE_CREDIT_REPO = "cormoran/zmk-module-template"; // zmk-module-template:keep

function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>DRV2605L Haptic Lab</h1>
        <p>Test built-in haptic effects through ZMK Studio</p>
      </header>

      <ZMKConnection
        autoReconnect
        renderDisconnected={({ connect, isLoading, error }) => (
          <section className="card">
            <h2>Device Connection</h2>
            {isLoading && <p>⏳ Connecting...</p>}
            {error && (
              <div className="error-message">
                <p>🚨 {error}</p>
              </div>
            )}
            {!isLoading && (
              <>
                <div className="connect-buttons">
                  {isWebSerialSupported() && (
                    <button
                      className="btn btn-primary"
                      onClick={() => connect(connectSerial)}
                    >
                      🔌 Connect USB
                    </button>
                  )}
                  {isWebBluetoothSupported() && (
                    <button
                      className="btn btn-primary"
                      onClick={() => connect(gattConnect)}
                    >
                      📶 Connect Bluetooth
                    </button>
                  )}
                  {!isWebSerialSupported() && !isWebBluetoothSupported() && (
                    <div className="warning-message">
                      <p>
                        ⚠️ Web Serial and Web Bluetooth are unavailable here.
                        Use a Chromium-based browser (Chrome, Edge, ...) over
                        HTTPS or localhost to connect to your keyboard.
                      </p>
                    </div>
                  )}
                </div>
                {isWebBluetoothSupported() && (
                  <p className="hint-message">
                    📶 Not showing up? Some firmware only advertises the Studio
                    Bluetooth service once unlocked — press the unlock key (
                    <code>&amp;studio_unlock</code> behavior) on your keyboard,
                    then try connecting again.
                  </p>
                )}
              </>
            )}
          </section>
        )}
        renderConnected={({ disconnect, deviceName }) => (
          <>
            <section className="card">
              <h2>Device Connection</h2>
              <div className="device-info">
                <h3>✅ Connected to: {deviceName}</h3>
              </div>
              <button className="btn btn-secondary" onClick={disconnect}>
                Disconnect
              </button>
            </section>

            <HapticLabSection />
          </>
        )}
      />

      <footer className="app-footer">
        <p>
          <strong>DRV2605L Haptic Lab</strong>
        </p>
        <p>
          <a
            href={`https://github.com/${GITHUB_REPO}`}
            target="_blank"
            rel="noreferrer"
          >
            {GITHUB_REPO}
          </a>
        </p>
        <p className="template-credit">
          Built from{" "}
          <a
            href={`https://github.com/${TEMPLATE_CREDIT_REPO}`}
            target="_blank"
            rel="noreferrer"
          >
            {TEMPLATE_CREDIT_REPO}
          </a>{" "}
          - AI ready ZMK module template by{" "}
          <a
            href="https://github.com/cormoran"
            target="_blank"
            rel="noreferrer"
          >
            @cormoran
          </a>
        </p>
      </footer>
    </div>
  );
}

export function HapticLabSection() {
  const zmkApp = useContext(ZMKAppContext);
  const { ready, subsystem, call } = useCustomSubsystem(
    SUBSYSTEM_IDENTIFIER,
    codec
  );
  const subsystemIndex = subsystem?.index;
  const [library, setLibrary] = useState(1);
  const [effect, setEffect] = useState(1);
  const [status, setStatus] = useState<Response["status"] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    if (!ready || subsystemIndex === undefined) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await call({ getStatus: {} });
      if (!response?.status) throw new Error("Unexpected status response");
      setStatus(response.status);
    } catch (error) {
      setMessage(
        `Status request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setBusy(false);
    }
  }, [ready, subsystemIndex, call]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshStatus(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshStatus]);

  const runAction = async (action: "play" | "stop") => {
    if (!ready || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const request =
        action === "play" ? { play: { library, effect } } : { stop: {} };
      const response = await call(request);
      if (!response?.result) throw new Error("Unexpected action response");
      setMessage(
        response.result.errorCode === 0
          ? `${action === "play" ? "Play" : "Stop"} succeeded.`
          : `${action === "play" ? "Play" : "Stop"} failed: firmware error ${response.result.errorCode}.`
      );
    } catch (error) {
      setMessage(
        `${action === "play" ? "Play" : "Stop"} request failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      setBusy(false);
    }
  };

  if (!zmkApp) return null;

  if (!subsystem) {
    return (
      <section className="card">
        <div className="warning-message">
          <p>
            ⚠️ Subsystem "{SUBSYSTEM_IDENTIFIER}" not found. Make sure your
            firmware includes the drv2605l-lab module. See the{" "}
            <a href={`https://github.com/${GITHUB_REPO}#readme`}>
              module README
            </a>{" "}
            for firmware setup.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Haptic control</h2>
      <div className="status-panel" aria-live="polite">
        <h3>Device status</h3>
        {!status && (
          <p>{busy ? "Reading device status…" : "Status unavailable."}</p>
        )}
        {status && (
          <>
            <p>Device: {status.present ? "configured" : "not configured"}</p>
            <p>Bus: {status.ready ? "ready" : "unavailable"}</p>
            <p>
              Status register: 0x{status.status.toString(16).padStart(2, "0")}
            </p>
            <p>Firmware error code: {status.errorCode}</p>
          </>
        )}
        <button
          className="btn btn-secondary"
          disabled={!ready || busy}
          onClick={() => void refreshStatus()}
        >
          Refresh status
        </button>
      </div>

      <div className="input-group">
        <label htmlFor="library-input">ROM library</label>
        <select
          id="library-input"
          value={library}
          onChange={(event) => setLibrary(Number(event.target.value))}
        >
          {[1, 2, 3, 4, 5, 6].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      <p className="hint-message">
        Libraries 1–5 are for ERM actuators; library 6 is for LRA.
      </p>
      <div className="input-group">
        <label htmlFor="effect-input">ROM effect (1–123)</label>
        <input
          id="effect-input"
          type="number"
          min="1"
          max="123"
          step="1"
          value={effect}
          onChange={(event) => setEffect(Number(event.target.value))}
        />
      </div>
      <div className="action-buttons">
        <button
          className="btn btn-primary"
          disabled={
            !ready ||
            busy ||
            !Number.isInteger(effect) ||
            effect < 1 ||
            effect > 123
          }
          onClick={() => void runAction("play")}
        >
          Play
        </button>
        <button
          className="btn btn-secondary"
          disabled={!ready || busy}
          onClick={() => void runAction("stop")}
        >
          Stop
        </button>
      </div>
      {message && (
        <p role="status" className="response-box">
          {message}
        </p>
      )}
    </section>
  );
}

export default App;
