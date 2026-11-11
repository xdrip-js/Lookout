/* global describe it */

const should = require('should');

const xDripAPS = require('../xDripAPS')();

// With no Sensor Start/Stop treatments in Nightscout (normal for a G7 on a
// fresh site) syncBGChecks asks for BG checks since `undefined`. That must
// produce a (possibly failing) request, not a synchronous TypeError that
// crashes the collector.
describe('xDripAPS.BGChecksSince without a start time', () => {
  it('returns a promise instead of throwing', async () => {
    const saved = [process.env.NIGHTSCOUT_HOST, process.env.API_SECRET];
    process.env.NIGHTSCOUT_HOST = 'http://127.0.0.1:9'; // nothing listens: request fails fast
    process.env.API_SECRET = 'x'.repeat(40);
    let result;
    try {
      result = xDripAPS.BGChecksSince(undefined);
    } finally {
      [process.env.NIGHTSCOUT_HOST, process.env.API_SECRET] = saved;
    }
    should(result).have.property('then');
    await result.catch(() => {});
  });
});
