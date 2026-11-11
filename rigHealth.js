// Decide whether repeated read failures justify rebooting the rig.
//
// A reboot can recover a wedged Bluetooth stack, but not a sensor that was
// never paired (new sensor, wrong pairing code, sensor not yet in range).
// So only reboot once readings have succeeded and then stopped.
const shouldRebootRig = ({
  txFailedReads, lastSuccessfulRead, now, rebootAfterMs = 11 * 60000,
}) => {
  if (!lastSuccessfulRead) {
    return false;
  }
  return txFailedReads >= 2 && (now - lastSuccessfulRead) > rebootAfterMs;
};

module.exports = { shouldRebootRig };
