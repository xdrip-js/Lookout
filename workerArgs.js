// Node flags for the forked transmitter worker. Measured on a Pi Zero W
// (Node 22): the G7 EC-J-PAKE exchange takes ~2.2 s with these flags versus
// 4.6-5 s with the launcher's tiny heap (constant scavenges), at ~55 MB peak RSS.
const WORKER_EXEC_ARGV = [
  '--max-old-space-size=128',
  '--max-semi-space-size=16',
];

module.exports = { WORKER_EXEC_ARGV };
