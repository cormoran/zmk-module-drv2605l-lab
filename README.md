# DRV2605L lab for ZMK

A bench module for trying the DRV2605L's built-in haptic effects from a
browser. It uses Zephyr's DRV2605 driver and ZMK's custom Studio RPC. The
browser can check device status, choose a ROM library and effect, play it, and
stop it. No keyboard behavior or automatic key feedback is included.

This module needs [cormoran/ZMK's `main+custom-studio-protocol` branch](https://github.com/cormoran/zmk/tree/main+custom-studio-protocol).
The browser UI needs Chrome or Edge on HTTPS or localhost for Web Serial or
Web Bluetooth. USB is the simplest route for a bench setup.

## Wiring: XIAO nRF52840 example

| XIAO | DRV2605L board |
| --- | --- |
| 3V3 | VIN |
| GND | GND |
| D8 / SDA | SDA |
| D5 / SCL | SCL |
| D9 | IN |

The example devicetree snippet sets I2C1 to D8/D5 and expects I2C address
`0x5a`. It configures D9 as the IN trigger output; ROM playback currently
uses I2C's internal trigger, so IN remains inactive during Play. Connect the
actuator to the DRV2605L output, following the breakout board's instructions.
The snippet is an **ERM** example using ROM libraries 1–5. For an LRA, change
`actuator-mode` to `"LRA"` and choose library 6 in the UI. Set
`vib-rated-mv` and `vib-overdrive-mv` to values appropriate for the actual
actuator **before powering the motor**; the example's 3000/3300 mV settings
are placeholders and can be too high for a small motor. If the breakout
exposes EN, keep it high or add `en-gpios` to the device node. The driver
needs working I2C pull-ups, usually provided by the breakout.

## Add to firmware

Add the module and patched ZMK to `config/west.yml`:

```yaml
manifest:
  remotes:
    - name: cormoran
      url-base: https://github.com/cormoran
  projects:
    - name: zmk
      remote: cormoran
      revision: main+custom-studio-protocol
      import: app/west.yml
    - name: zmk-module-drv2605l-lab
      remote: cormoran
      revision: main
      import: true
```

Add these options to the relevant `.conf` file:

```conf
CONFIG_ZMK_STUDIO=y
CONFIG_ZMK_DRV2605L_LAB=y
CONFIG_ZMK_DRV2605L_LAB_STUDIO_RPC=y
CONFIG_HAPTICS=y
CONFIG_HAPTICS_DRV2605=y
CONFIG_ZMK_STUDIO_RPC_RX_BUF_SIZE=128
```

Add the `drv2605l-lab` snippet to the build target (or copy its overlay into
your board configuration). For the example XIAO build, use
`-S drv2605l-lab -S studio-rpc-usb-uart`. The generic device overlay and
sample configuration are under `snippets/drv2605l-lab/`. Adapt the I2C bus,
GPIO, and voltage settings to your board and actuator. The test-only XIAO
shield pin workaround is under `tests/zmk-config/config/`.

## Use the browser UI

Run the UI locally:

```sh
cd web
NPM_CONFIG_ALLOW_GIT=all npm ci
npm run dev
```

Open the localhost URL in Chrome or Edge. Connect by USB, press **Refresh**
to verify the DRV2605L is ready, select a library and effect, then press
**Play**. **Stop** clears a running effect. A missing device or I2C failure is
shown as an error. For Bluetooth, ZMK Studio may require an unlock behavior;
USB with the example snippet is recommended for initial tests.

## Development

The complete test manifest is `west/west-test-isolated.yml`. In a compatible
West workspace, run `west zmk-build tests/zmk-config -m . -d ./build -q`,
`west zmk-test tests -m . -d ./build`, and the web checks in `web/README.md`.
`DESIGN.md` records the RPC and hardware decisions. Actual vibration and
voltage safety must be checked with the connected actuator; firmware and web
tests cannot prove motor behavior.
