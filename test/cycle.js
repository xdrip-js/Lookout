/* global describe it */

const should = require('should');

const { cycleTiming } = require('../cycle');

// Collection timing scales with the sensor's reading interval so the lab can
// run a fast simulator cycle; the default must stay exactly as before.
describe('cycle.cycleTiming', () => {
  it('keeps the standard 5-minute values by default', () => {
    const t = cycleTiming(undefined);
    t.cycleMs.should.equal(5 * 60000);
    t.workerTimeoutMs.should.equal(6.5 * 60000);
    t.rebootAfterMs.should.equal(11 * 60000);
    t.gapMs.should.equal(6 * 60000);
    t.gapMarginMs.should.equal(60000);
  });

  it('scales everything for a 60 s lab cycle', () => {
    const t = cycleTiming('60');
    t.cycleMs.should.equal(60000);
    t.workerTimeoutMs.should.equal(78000);
    t.rebootAfterMs.should.equal(132000);
    t.gapMs.should.equal(72000);
    t.gapMarginMs.should.equal(12000);
  });

  // A real G7 sharing its readings with a pump and a phone accepted new
  // connections only in the first seconds of its 5-minute burst, and a
  // Lookout worker takes ~12 s to start on a Pi Zero. With no head start
  // (upstream #153) the 18:15 reading was missed on 2026-11-10: the worker was
  // ready 10 s after the burst opened. Start it ~30 s early instead.
  it('starts the worker well before the expected reading', () => {
    cycleTiming(undefined).preWakeMs.should.equal(30000);
    cycleTiming('60').preWakeMs.should.equal(6000);
  });

  it('ignores nonsense and never goes below 30 s', () => {
    cycleTiming('abc').cycleMs.should.equal(5 * 60000);
    cycleTiming('5').cycleMs.should.equal(30000);
  });
});

should(true).be.ok();
