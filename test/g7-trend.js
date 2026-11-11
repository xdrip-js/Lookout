/* global describe it */

const should = require('should');

const calibration = require('../calibration');

// A G7 provides no raw (filtered/unfiltered) data, so Lookout never has a
// transmitter calibration for it. The trend sent to Nightscout must then come
// from the sensor itself (tenths of mg/dL/min, as for G6) instead of 0 / Flat.

const fakeStorage = () => {
  const items = {};
  return {
    getItem: async (key) => items[key],
    setItem: async (key, value) => { items[key] = value; },
  };
};

const NOW = 1793532485000;
const MIN = 60 * 1000;

const g7Sgv = (overrides) => ({
  inSession: true,
  state: 6,
  glucose: 120,
  trend: -25,
  readDateMills: NOW,
  ...overrides,
});

const calibrate = (glucoseHist, sgv) => calibration.calibrateGlucose(
  fakeStorage(),
  {},
  null,
  null,
  glucoseHist,
  sgv,
);

// Seen over the air: `lookout id` stores a placeholder "Unity" calibration,
// so the no-calibration branch was skipped and Lookout computed a trend from
// history that still held the previous sensor's (lower) readings: SingleUp
// while the sensor itself reported falling glucose.
describe('G7 trend with a placeholder calibration', () => {
  it('still uses the trend reported by the sensor', async () => {
    const storage = fakeStorage();
    await storage.setItem('g5Calibration', {
      date: NOW - 120 * MIN, dateMills: NOW - 120 * MIN, slope: 1000, intercept: 0, type: 'Unity',
    });
    const hist = [
      { glucose: 75, readDateMills: NOW - 12 * MIN },
      { glucose: 116, readDateMills: NOW - 2 * MIN },
    ];
    const current = g7Sgv({ glucose: 112, trend: -12 });
    const sgv = await calibration.calibrateGlucose(storage, {}, null, null, hist, current);
    sgv.trend.should.equal(-12);
  });
});

describe('G7 trend without a calibration', () => {
  it('uses the trend reported by the sensor', async () => {
    const sgv = await calibrate([], g7Sgv({ trend: -25 }));
    sgv.trend.should.equal(-25);
  });

  it('falls back to the glucose history when the sensor has no trend (127)', async () => {
    const hist = [
      { glucose: 130, readDateMills: NOW - 10 * MIN },
      { glucose: 125, readDateMills: NOW - 5 * MIN },
    ];
    const sgv = await calibrate(hist, g7Sgv({ glucose: 120, trend: 127 }));
    sgv.trend.should.be.approximately(-10, 0.001); // -10 mg/dL over 10 min
  });

  it('reports 0 when there is neither a sensor trend nor history', async () => {
    const sgv = await calibrate([], g7Sgv({ trend: null }));
    sgv.trend.should.equal(0);
  });
});

should(true).be.ok();
