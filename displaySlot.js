// Which G7 display slot Lookout claims on the sensor.
//
// A G7 serves one client per display type, each with its own slot:
//   1 medical  - Dexcom receiver OR a pump (e.g. Omnipod 5)
//   2 phone    - the Dexcom G7 app
//   3 watch    - Dexcom direct-to-watch
// Claiming the medical slot can disconnect a pump's CGM link, so it is
// refused unless explicitly forced. On G6, --alternate meant "receiver
// channel"; on G7 it means the medical slot.

const NAMES = { medical: 1, phone: 2, watch: 3 };
const DEFAULT_G7 = NAMES.watch;

// txId is unset until `lookout id` has been run on a fresh install.
const isG7 = (txId) => typeof txId === 'string' && txId.length > 0 && txId.length < 6;

const parse = (displayType) => {
  if (typeof displayType === 'string' && displayType.toLowerCase() in NAMES) {
    return NAMES[displayType.toLowerCase()];
  }
  const n = Number(displayType);
  if (Number.isInteger(n) && n >= 1 && n <= 3) {
    return n;
  }
  throw new Error(`invalid G7 display type "${displayType}" (use watch, phone, medical or 1-3)`);
};

// Returns the slot number for a G7, or null for G5/G6 (not applicable).
// Throws if the medical slot would be used without forceMedical.
const resolveDisplayType = ({
  txId, displayType = null, alternate = false, forceMedical = false,
}) => {
  if (!isG7(txId)) {
    return null;
  }

  let slot = DEFAULT_G7;
  if (displayType !== null && displayType !== undefined && displayType !== '') {
    slot = parse(displayType);
  } else if (alternate) {
    slot = NAMES.medical;
  }

  if (slot === NAMES.medical && !forceMedical) {
    throw new Error('refusing to use the G7 medical slot (receiver/pump such as Omnipod 5): '
      + 'it can disconnect the pump\'s CGM link. Use --display_type watch or phone, '
      + 'or add --force_medical_slot if no pump or receiver uses this sensor.');
  }

  return slot;
};

// Hint for repeated failed reads on the G7 watch slot. xdrip-js presents the
// community's xDrip+ display certificate; a real sensor might tie it to the
// phone display type and refuse it on the watch slot (untested on hardware).
const slotFailureHint = ({ txId, displayType, failedReads }) => {
  if (!isG7(txId) || displayType !== NAMES.watch || failedReads < 3) {
    return null;
  }
  return `${failedReads} failed reads on the G7 watch slot (3). One possible cause: the sensor `
    + 'may not accept the xDrip+ display certificate on the watch slot. If this persists with a '
    + 'real sensor, try --display_type phone (slot 2; this conflicts with the Dexcom app if it '
    + 'runs on a phone near this sensor).';
};

module.exports = { resolveDisplayType, slotFailureHint, NAMES };
