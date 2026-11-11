// Which `debug` namespaces Lookout logs at each --verbose level.
//
// The low-level Bluetooth traces (`bluetooth-manager`, `transmitter`, `smp`)
// log every advert, connect attempt and packet. On a single-core Pi Zero that
// logging competes for the CPU with the G7's ~3.3 s pairing steps, so it is
// only on with -v. keks-plugin (pairing progress) stays on.
const BASE = [
  'Lookout:*', 'calcStats:*', 'calibration:*', 'clientIO:*', 'fakemeter:*', 'loopIO:*',
  'pumpIO:*', 'storageLock:*', 'syncNS:*', 'transmitterIO:*', 'transmitterWorker:*',
  'xDripAPS:*', 'keks-plugin:*',
];
const BLUETOOTH = ['transmitter', 'smp', 'bluetooth-manager'];
const VERBOSE2 = ['transmitter:queue-doNext', 'keks-calc', 'signaling', 'bindings',
  'acl-att-stream', 'att', 'gap', 'hci:connection', 'backfill-parser'];

module.exports = (verbose = 0) => {
  if (verbose <= 0) return [...BASE, '-*:debug'].join(',');
  if (verbose === 1) return [...BASE, ...BLUETOOTH].join(',');
  if (verbose === 2) return [...BASE, ...BLUETOOTH, ...VERBOSE2].join(',');
  return '*,*:*';
};
