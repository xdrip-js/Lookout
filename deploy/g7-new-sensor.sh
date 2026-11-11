#!/bin/sh
# Switch Lookout to a new Dexcom G7 (or re-pair the current one).
#
#   sudo g7-new-sensor <pairing-code> <sensor-name> [--dry-run]
#   e.g. sudo g7-new-sensor 1234 DXCMAB
#
# <pairing-code> is the 4-digit code on the sensor applicator/package.
# <sensor-name> is the sensor's Bluetooth name: "DXCM" plus the last two
# characters of the serial number shown in the Dexcom app (Settings > Sensor).
#
# What it does:
#   1. stops Lookout
#   2. scans for a sensor advertising exactly that name (never any other) and
#      takes its address
#   3. removes the previous sensor's Bluetooth bond
#   4. pins Lookout to the new address (--sensor_address in /etc/lookout.env)
#   5. stores the new code and clears the saved sensor key and calibration
#      (what Lookout's own "change transmitter ID" does)
#   6. starts Lookout, which pairs (J-PAKE) at the sensor's next 5-min burst
#
# Best done right after inserting a new sensor, BEFORE the pump/phone app
# connect, though a running sensor also works.
set -eu

ENV=/etc/lookout.env
SCAN_SECONDS=${SCAN_SECONDS:-360}

usage() { sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
die() { echo "g7-new-sensor: $*" >&2; exit 1; }

CODE=${1:-}; NAME=${2:-}; DRY=${3:-}
[ -n "$CODE" ] && [ -n "$NAME" ] || usage
echo "$CODE" | grep -Eq '^[0-9]{4}$' || die "pairing code must be 4 digits"
echo "$NAME" | grep -Eq '^DXCM[A-Za-z0-9]{2}$' || die "sensor name must look like DXCMAB"
[ "$(id -u)" -eq 0 ] || die "run with sudo"
[ -f "$ENV" ] || die "$ENV not found"

ARGS=$(sed -n 's/^LOOKOUT_ARGS=//p' "$ENV")
case " $ARGS " in
  *" --force_medical_slot"*|*" --alternate"*)
    die "LOOKOUT_ARGS uses the pump's medical slot; refusing (use --display_type watch)";;
esac

DIR=$(systemctl show lookout -p WorkingDirectory --value)
RUN_AS=$(systemctl show lookout -p User --value)
NODE_PATH_DIR=$(systemctl show lookout -p Environment --value | tr ' ' '\n' | sed -n 's/^PATH=//p' | cut -d: -f1)
[ -d "$DIR/storage" ] || die "Lookout storage not found under $DIR"
OLD=$(echo "$ARGS" | sed -n 's/.*--sensor_address \([0-9A-Fa-f:]\{17\}\).*/\1/p')

if [ "$DRY" = "--dry-run" ]; then echo "dry run: lookout keeps running"; else echo "stopping lookout"; fi
[ "$DRY" = "--dry-run" ] || systemctl stop lookout

echo "scanning up to ${SCAN_SECONDS}s for $NAME (it advertises about once a minute)"
SCANLOG=$(mktemp)
trap 'rm -f "$SCANLOG"' EXIT
bluetoothctl --timeout "$SCAN_SECONDS" scan le > "$SCANLOG" 2>&1 &
SCAN=$!
strip() { sed 's/\x1b\[[0-9;]*m//g'; }   # bluetoothctl colours paired devices
NEW=""; END=$(( $(date +%s) + SCAN_SECONDS ))
while [ "$(date +%s)" -lt "$END" ]; do
  # Only a device with exactly this name that advertised during THIS scan.
  # (BlueZ reports no RSSI for an already-bonded device, so use the scan's
  # own [NEW]/[CHG] lines rather than `bluetoothctl info`.)
  for mac in $(bluetoothctl devices | strip | awk -v n="$NAME" '$1 == "Device" && $3 == n {print $2}'); do
    if strip < "$SCANLOG" | grep -Eq "\[(NEW|CHG)\] Device $mac "; then
      [ -n "$NEW" ] && [ "$NEW" != "$mac" ] && { kill $SCAN 2>/dev/null; die "two devices named $NAME; aborting"; }
      NEW=$mac
    fi
  done
  [ -n "$NEW" ] && break
  sleep 3
done
kill $SCAN 2>/dev/null || true
bluetoothctl scan off >/dev/null 2>&1 || true
[ -n "$NEW" ] || { [ "$DRY" = "--dry-run" ] || systemctl start lookout; die "$NAME not seen; is it close to the rig? (lookout restarted unchanged)"; }
echo "found $NAME at $NEW"

if [ "$DRY" = "--dry-run" ]; then
  echo "dry run: would remove bond ${OLD:-none}, pin $NEW, store code $CODE, clear key"
  exit 0
fi

for mac in $OLD $NEW; do
  bluetoothctl remove "$mac" >/dev/null 2>&1 && echo "removed Bluetooth bond/cache for $mac" || true
done

if echo "$ARGS" | grep -q -- '--sensor_address'; then
  sed -i "s/--sensor_address [0-9A-Fa-f:]\{17\}/--sensor_address $NEW/" "$ENV"
else
  sed -i "s/^LOOKOUT_ARGS=.*/& --sensor_address $NEW/" "$ENV"
fi
grep -q -- "--sensor_address $NEW" "$ENV" || die "could not update $ENV"
echo "pinned Lookout to $NEW"

sudo -u "$RUN_AS" env PATH="$NODE_PATH_DIR:$PATH" node -e '
  const dir = process.argv[1]; const code = process.argv[2];
  (async () => {
    const store = require(dir + "/node_modules/node-persist");
    await store.init({ dir: dir + "/storage", forgiveParseErrors: true });
    const storage = require(dir + "/storage"); storage.init(store);
    await storage.setItem("sensorKey", null);
    await require(dir + "/calibration").clearCalibration(storage);
    await storage.setItem("id", code);
    console.log("stored new pairing code; cleared saved sensor key and calibration");
  })().catch((e) => { console.error(e); process.exit(1); });
' "$DIR" "$CODE"

systemctl start lookout
echo "lookout started: it pairs at the sensor's next 5-minute burst."
echo "watch it with:  journalctl -u lookout -f | grep -E 'Received glucose|Tx 0a0|0a0300'"
