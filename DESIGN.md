# DRV2605L lab design

## Goal

Exercise one DRV2605L from a Chromium browser through ZMK Studio custom RPC.
This is a bench tool; no key-triggered haptics, split relay, persistence, or
keyboard interaction is required.

## Hardware and configuration

Use Zephyr's `ti,drv2605` driver and haptics API. The example target is XIAO
nRF52840 with the DRV2605L on I2C1 (SDA D8, SCL D5, address 0x5a), IN on D9,
and VIN on 3.3V. A module snippet enables the bus and defines
`/aliases { drv2605l = &haptic; };`.
Device tree chooses ERM or LRA, voltage limits, and optional EN GPIO. The lab
feature and Studio RPC are Kconfig options. Studio RPC compiles without the
device node so native_sim can report device unavailable.

## RPC

Subsystem `cormoran__drv2605l_lab` is unsecured for bench use. Requests and
responses are bounded protobuf messages:

| Request | Response | Action |
| --- | --- | --- |
| GetStatus | Status: present, ready, status register, playing, error code | Probe configured node and read DRV2605L status and GO registers over I2C |
| Play: library 1..6, effect 1..123 | Result: error code | Stop current output, configure one ROM sequence entry, start |
| Stop | Result: error code | Stop output through Zephyr haptics API |

Library 6 is for LRA; libraries 1..5 are for ERM. The firmware validates
range and actuator/library match; the UI describes the actuator match. The
LRA overlay starts with low voltage values, and firmware clears the
Zephyr driver's LRA open-loop bit before LRA ROM playback to allow resonance
tracking. No arbitrary register writes or
continuous RTP are exposed. Calls are short and run synchronously on Studio's
RPC thread. A static response buffer meets nanopb's delayed encoding rule.
The existing test config uses 128-byte RX and 64-byte TX buffers; enforce a
compile-time minimum for the encoded response plus Studio framing.

## Browser

Keep the template's USB/BLE connection controls. On connection, load status
once; offer library and effect selection, Play, Stop, and Refresh status.
Sequential playback polls GetStatus and advances only after GO clears.
Display firmware error codes and bus/device readiness clearly. The codec must
remain stable across renders to avoid repeat RPC loads.

## Verification

Build a no-device Studio target and an XIAO hardware target with the I2C
snippet. Test protocol validation with native_sim where feasible, web controls
with mocked RPC, and generated UI/browser build. Real motor response requires
hardware and is documented as a manual check.
