/* global describe it */

const should = require('should');
const moment = require('moment');

const { backfillRequest } = require('../backfillRequest');

const MIN = 60000;
const NOW = moment('2026-11-08T17:25:00Z');
const gap = (startMinAgo, endMinAgo) => ({
  gapStart: NOW.clone().subtract(startMinAgo * MIN, 'ms'),
  gapEnd: NOW.clone().subtract(endMinAgo * MIN, 'ms'),
});
const ask = (gaps, extra = {}) => backfillRequest({
  gaps, now: NOW, inSession: true, hasHistory: true, cycleMs: 5 * MIN, ...extra,
});

describe('backfillRequest', () => {
  it('requests a missed 5-minute gap, stopping 2 min short of now (unchanged behaviour)', () => {
    const r = ask([gap(14, 0)]);
    r.start.valueOf().should.equal(NOW.valueOf() - 14 * MIN);
    r.end.valueOf().should.equal(NOW.valueOf() - 2 * MIN);
  });

  // Seen over the air at a 60 s lab cycle: a 2-reading gap was judged "too
  // short" by the fixed 1 / 2 / 2 minute thresholds and never requested.
  it('requests a 2-reading gap at a 60 s cycle', () => {
    const r = ask([gap(3.2, 0)], { cycleMs: MIN });
    should.exist(r.start);
    r.end.valueOf().should.equal(NOW.valueOf() - 0.4 * MIN);
  });

  it('skips a gap shorter than the reading being collected', () => {
    ask([gap(1.5, 0)]).skip.should.match(/too short/);
  });

  it('reports the real reason when the transmitter is not in session', () => {
    ask([gap(14, 0)], { inSession: false }).skip.should.match(/not in session/);
  });

  it('reports when there is no glucose history', () => {
    ask([gap(14, 0)], { hasHistory: false }).skip.should.match(/no glucose history/);
  });

  it('has nothing to do without gaps', () => {
    should(ask([])).equal(null);
  });

  it('never reaches back more than 179 minutes', () => {
    const r = ask([gap(600, 0)]);
    r.start.valueOf().should.equal(NOW.valueOf() - 179 * MIN);
  });
});
