/* global describe it afterEach */
/* eslint-disable global-require */

const path = require('path');
require('should');

// The collector is a single-core Pi Zero and a real G7 allows ~3.3 s per
// pairing step, so the rig must not burn CPU on things it does not use.

describe('debug namespaces', () => {
  const debugNamespaces = require('../debugNamespaces');

  it('keeps the per-advert Bluetooth traces out of the default log', () => {
    const ns = debugNamespaces(0).split(',');
    ns.should.not.containEql('bluetooth-manager');
    ns.should.not.containEql('transmitter');
    ns.should.containEql('transmitterIO:*');
    ns.should.containEql('keks-plugin:*');
    ns.should.containEql('-*:debug');
  });

  it('adds them back with -v', () => {
    const ns = debugNamespaces(1).split(',');
    ns.should.containEql('bluetooth-manager');
    ns.should.containEql('transmitter');
  });
});

describe('fakemeter online check', () => {
  const execPath = require.resolve(path.join(__dirname, '../childExecPromise'));
  const fakemeterPath = require.resolve(path.join(__dirname, '../fakemeter'));
  let calls;

  const load = () => {
    calls = [];
    require.cache[execPath] = {
      id: execPath,
      filename: execPath,
      loaded: true,
      exports: async (cmd) => { calls.push(cmd); return { stdout: '', stderr: '' }; },
    };
    delete require.cache[fakemeterPath];
    return require('../fakemeter');
  };
  const storage = { getItem: async () => '000000', setItem: async () => {} };
  const client = { meterId: () => {}, setFakeMeter: () => {} };

  afterEach(() => { delete require.cache[execPath]; delete require.cache[fakemeterPath]; });

  it('does not run lookout_online when the fakemeter is not used', async () => {
    const meter = load()({ fakemeter: false, offline_fakemeter: false }, storage, client);
    await meter.glucose(120);
    await new Promise((r) => { setImmediate(r); });
    calls.should.eql([]);
  });

  it('still checks online status for --offline_fakemeter', async () => {
    const meter = load()({ fakemeter: false, offline_fakemeter: true }, storage, client);
    await meter.glucose(120);
    await new Promise((r) => { setImmediate(r); });
    calls.should.containEql('lookout_online');
  });
});

describe('local xDripAPS post', () => {
  const { postToLocalXdrip } = require('../rigOutputs');

  it('is skipped with --no_xdripaps', () => {
    postToLocalXdrip({ xdripaps: false }, true).should.equal(false);
  });

  it('keeps the existing behaviour by default', () => {
    postToLocalXdrip({}, true).should.equal(true);
    postToLocalXdrip({ xdripaps: true }, false).should.equal(false);
  });
});
