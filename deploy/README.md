# Lookout on a Raspberry Pi with a Dexcom G7

Tested with a Pi Zero W (single core), Raspberry Pi OS with BlueZ 5.82, and
Node 22. Lookout reads the G7 on the **watch** display slot (3), so the
pump (slot 1, for example an Omnipod 5) and the phone app (slot 2) keep their
own connections.

## Install

```sh
cd ~/src/Lookout && npm install
sudo deploy/install.sh          # units, Bluetooth fix, g7-new-sensor
sudoedit /etc/lookout.env       # Nightscout host and secret
sudo g7-new-sensor <code> <DXCMxx>
sudo systemctl enable --now lookout
```

`<code>` is the 4-digit pairing code from the sensor package. `<DXCMxx>` is
the sensor's Bluetooth name: `DXCM` followed by the last two characters of
the serial number shown in the Dexcom app.

## New sensor

Run the same command, `sudo g7-new-sensor <code> <DXCMxx>`. The script:

- scans only for that exact name and pins Lookout to it, so it never tries
  another person's sensor nearby
- clears the old pairing key and Bluetooth bond
- pairs at the sensor's next 5-minute reading

Add `--dry-run` to check the scan without changing anything.

If you can, pair Lookout before the pump and the phone app connect to a fresh
sensor. Pairing a running sensor also works.

## Why the system changes are needed

- **`bluetooth.service.d/g7.conf`** (`bluetoothd --noplugin=gap`). After
  service discovery, BlueZ's GAP plugin reads the G7's preferred connection
  parameters and applies them: 75 ms interval with peripheral latency 40.
  That lets the sensor skip up to 3 s of connection events, so it misses
  Lookout's J-PAKE replies and hangs up, with status `0a0300` or a silent
  drop. The Dexcom app on Android keeps latency 0. This plugin is the only
  BlueZ change; the stock `bluetoothd` is used.
- **`lookout.service.d/priority.conf`** (`Nice=-15`). A G7 allows about 3.3 s
  per pairing step. On a single-core Pi Zero, dbus-daemon, NetworkManager and
  bluetoothd handle every Bluetooth notification and compete with Lookout's
  replies. A multi-core Pi (Zero 2 W or later) has more headroom.
- **`--no_xdripaps`**. Skips posting to a local OpenAPS xDripAPS server on
  127.0.0.1:5000, which a Lookout-only rig doesn't have.

Pairing details live in xdrip-js:

- P-256 maths through OpenSSL
- proof checks deferred until after each reply
- write-without-response fragments
- the Authentication subscription made before ExtraData

## Watching it

```sh
journalctl -u lookout -f | grep -E 'got glucose|uploaded SGV|0a0300|Error'
```

Start Lookout with `-v` in `LOOKOUT_ARGS` to add the low-level Bluetooth traces.
