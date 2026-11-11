// Sensor session rules that differ between G5, G6 and G7.

// txId is unset until `lookout id` has been run on a fresh install.
const hasId = (txId) => typeof txId === 'string' && txId.length > 0;
const isG7 = (txId) => hasId(txId) && txId.length < 6;

const DAY_MINUTES = 24 * 60;
// Shortest G7 (10 days + 12 h grace) until the sensor reports its own length.
const DEFAULT_G7_MINUTES = 10.5 * DAY_MINUTES;

// reportedSessionLengthSeconds: from the G7 0x52 version reply
// (xdrip-js firmwareData.sessionLengthSeconds); includes the grace period.
const sessionLengthMinutes = (txId, reportedSessionLengthSeconds) => {
  if (isG7(txId)) {
    if (reportedSessionLengthSeconds > 0) {
      return reportedSessionLengthSeconds / 60;
    }
    return DEFAULT_G7_MINUTES;
  }

  // G6s are 10 days
  if (hasId(txId) && txId.substr(0, 1) === '8') {
    return 10 * DAY_MINUTES;
  }

  // default to G5's 7 days
  return 7 * DAY_MINUTES;
};

// A G7 session cannot be stopped from the rig (xdrip-js drops StopSensor).
// Unknown sensor (no id yet): never stop anything.
const canStopSession = (txId) => hasId(txId) && !isG7(txId);

// A G7 starts its own session on insertion; nothing to start without an id.
const canStartSession = (txId) => hasId(txId) && !isG7(txId);

// Whether NS Sensor Insert / Sensor Stop treatments mean the transmitter's
// current session should be stopped: 'insert', 'stop' or null.
// sessionStart, sensorInsert, sensorStop: moments (or null).
const nsStopReason = ({
  txId, sessionStart, sensorInsert, sensorStop,
}) => {
  if (!canStopSession(txId) || !sessionStart) {
    return null;
  }

  // Give 6 minutes extra time
  const sensorStartDelta = sensorInsert
    ? (sensorInsert.valueOf() - sessionStart.valueOf() - 6 * 60000) : 0;
  const sensorStopDelta = sensorStop ? (sensorStop.valueOf() - sessionStart.valueOf()) : 0;

  if (sensorStartDelta > 0) {
    return 'insert';
  }
  if (sensorStopDelta > 0) {
    return 'stop';
  }
  return null;
};

// Battery status is informational. Ask for it when the last status is over
// 25 minutes old, but at most once per 25 minutes: a sensor that does not
// answer (g7sim, possibly a real G7) must not cost a timeout every cycle.
const BATTERY_INTERVAL_MS = 25 * 60000;
const batteryRequestDue = ({ statusTime, lastRequestTime, now }) => {
  const stale = !statusTime || (now - statusTime) > BATTERY_INTERVAL_MS;
  const notRecentlyAsked = !lastRequestTime || (now - lastRequestTime) > BATTERY_INTERVAL_MS;
  return stale && notRecentlyAsked;
};

module.exports = {
  sessionLengthMinutes, canStopSession, canStartSession, nsStopReason, batteryRequestDue, isG7,
};
