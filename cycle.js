// Collection timing, derived from the sensor's reading interval.
//
// A real G7 reads every 300 s. For lab testing against a simulator running a
// shorter cycle, set LOOKOUT_CYCLE_SECONDS (minimum 30). The ratios reproduce
// Lookout's original constants exactly at 300 s:
//   worker timeout 6.5 min, reboot after 11 min, gap 6 min, gap margin 1 min,
// plus a 30 s worker head start before each expected reading.
const DEFAULT_SECONDS = 300;
const MIN_SECONDS = 30;

const cycleTiming = (secondsSetting) => {
  let seconds = Number(secondsSetting);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    seconds = DEFAULT_SECONDS;
  }
  seconds = Math.max(seconds, MIN_SECONDS);
  const cycleMs = seconds * 1000;
  return {
    cycleMs,
    workerTimeoutMs: Math.round(cycleMs * 1.3),
    rebootAfterMs: Math.round(cycleMs * 2.2),
    gapMs: Math.round(cycleMs * 1.2),
    gapMarginMs: Math.round(cycleMs * 0.2),
    // Start the worker this long before the expected reading: a G7 shared
    // with a pump and a phone accepts new connections only at the start of
    // its burst, and a worker needs ~12 s to start on a Pi Zero.
    preWakeMs: Math.round(cycleMs * 0.1),
  };
};

module.exports = { cycleTiming, timing: cycleTiming(process.env.LOOKOUT_CYCLE_SECONDS) };
