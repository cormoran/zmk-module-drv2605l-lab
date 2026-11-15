/** Browser against Renode firmware via the serial shim. No motor is attached. */
import { test, expect } from "@playwright/test";

const SHIM_URL = process.env.ZMK_WEB_E2E_SHIM_URL;
const DEVICE_NAME = process.env.ZMK_WEB_E2E_DEVICE_NAME || "Module Test";

test("status and action RPCs reach the firmware", async ({ page, request }) => {
  test.skip(!SHIM_URL, "run through west zmk-web-e2e");
  await page.addInitScript(await (await request.get(SHIM_URL!)).text());
  await page.goto("/");
  await page.getByRole("button", { name: /Connect USB/ }).click();
  await expect(page.getByText(`Connected to: ${DEVICE_NAME}`)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Haptic control" })
  ).toBeVisible();
  await expect(page.getByText("Device: not configured")).toBeVisible();
  await expect(page.getByText("Bus: unavailable")).toBeVisible();
  await page.getByRole("button", { name: "Refresh status" }).click();
  await expect(
    page.getByText("Firmware error code:", { exact: false })
  ).toBeVisible();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByRole("status")).toContainText(
    /Stop failed: firmware error/
  );
});
