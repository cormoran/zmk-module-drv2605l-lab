# DRV2605L Haptic Lab Web UI

This React/Vite app connects to a ZMK keyboard over USB Web Serial or BLE Web Bluetooth and controls the `cormoran__drv2605l_lab` Studio RPC subsystem. Use Chromium over HTTPS or localhost.

After connecting, the app reads DRV2605L status once. **Refresh status** reads it again. Choose ROM library 1–6 and effect 1–123, then press **Play**. **Stop** stops the output. Libraries 1–5 target ERM actuators; library 6 targets LRA. The status panel reports device presence, bus readiness, status register, and firmware error code. Action results report firmware error codes, including unavailable hardware.

The firmware configuration (actuator type, voltage limits, and I2C pins) is set in device tree. This UI does not change those settings. Consult the repository README for wiring and firmware build steps.

## Develop and verify

```sh
NPM_CONFIG_ALLOW_GIT=all npm ci
npm run generate
npm run lint
npm test -- --runInBand
VITE_BASE=/ npm run build
VITE_BASE=/zmk-module-drv2605l-lab/ npm run build
```

`npm run generate` uses `buf.gen.yaml` to generate TypeScript from `../proto`. The generated files live under `src/proto` and are not edited by hand.

The mock tests cover connection controls, the one-time status load, selected Play/Stop requests, range validation, and firmware errors. The Renode browser test in `e2e/rpc.spec.ts` requires the `west zmk-web-e2e` serial shim. It verifies the no-device status and Stop error; an attached motor must be checked manually.
