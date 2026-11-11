/* global describe it */

const should = require('should');

const { WORKER_EXEC_ARGV } = require('../workerArgs');

// The transmitter worker does the G7 EC-J-PAKE in pure JS. With the launcher's
// tiny heap (--max-old-space-size=76 --max-semi-space-size=2) V8 scavenges
// constantly and the exchange takes ~2x longer on a Pi Zero (measured
// 4.6-5 s vs 2.2 s), so the worker must not inherit those flags.
describe('transmitter worker Node flags', () => {
  it('does not inherit the 2 MB semi-space from the launcher', () => {
    WORKER_EXEC_ARGV.should.not.containEql('--max-semi-space-size=2');
  });

  it('uses a young generation large enough for the crypto', () => {
    WORKER_EXEC_ARGV.should.containEql('--max-semi-space-size=16');
  });

  it('still caps the worker heap', () => {
    WORKER_EXEC_ARGV.some((a) => a.startsWith('--max-old-space-size=')).should.be.true();
  });
});

should(true).be.ok();
