// Decide whether (and for what window) to ask the transmitter for backfill.
//
// gaps: [{ gapStart, gapEnd }] (moments) from transmitterIO's sgvGaps.
// The thresholds scale with the reading cycle; at 300 s they are Lookout's
// original fixed values: a gap ending within 1 min of now is trimmed by 2 min
// (the reading about to be collected), and only spans over 2 min are asked for.
const MAX_LOOKBACK_MINUTES = 179;

const backfillRequest = ({
  gaps, now, inSession, hasHistory, cycleMs = 5 * 60000,
}) => {
  if (!gaps || gaps.length === 0) {
    return null;
  }

  let start = null;
  let end = null;
  gaps.forEach((gap) => {
    if (!start || start.diff(gap.gapStart) > 0) start = gap.gapStart.clone();
    if (!end || end.diff(gap.gapEnd) < 0) end = gap.gapEnd.clone();
  });

  const oldest = now.clone().subtract(MAX_LOOKBACK_MINUTES, 'minutes');
  if (start.isBefore(oldest)) start = oldest.clone();
  if (end.isBefore(oldest)) end = oldest.clone();

  // don't ask for the reading about to be collected in this connection
  if (Math.abs(now.diff(end)) < 0.2 * cycleMs) {
    end.subtract(0.4 * cycleMs, 'ms');
  }

  if (!hasHistory) {
    return { skip: 'no glucose history' };
  }
  if (end.diff(start) <= 0.4 * cycleMs) {
    return { skip: 'gap too short (only the reading being collected)' };
  }
  if (!inSession) {
    return { skip: 'transmitter not in session' };
  }
  return { start, end };
};

module.exports = { backfillRequest };
