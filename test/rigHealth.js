/* global describe it */

const should = require('should');

const rigHealth = require('../rigHealth');

const NOW = 1793532485000;
const MIN = 60 * 1000;

describe('rigHealth.shouldRebootRig', () => {
  it('reboots after repeated failures once readings have stopped for 11+ minutes', () => {
    rigHealth.shouldRebootRig({ txFailedReads: 2, lastSuccessfulRead: NOW - 12 * MIN, now: NOW })
      .should.equal(true);
  });

  it('does not reboot while readings are recent', () => {
    rigHealth.shouldRebootRig({ txFailedReads: 3, lastSuccessfulRead: NOW - 6 * MIN, now: NOW })
      .should.equal(false);
  });

  it('does not reboot after a single failure', () => {
    rigHealth.shouldRebootRig({ txFailedReads: 1, lastSuccessfulRead: NOW - 60 * MIN, now: NOW })
      .should.equal(false);
  });

  // New sensor / new pairing code: nothing has been read from it yet. A reboot
  // cannot fix a pairing problem, and would repeat every cycle.
  it('does not reboot when no reading has ever succeeded for this sensor', () => {
    rigHealth.shouldRebootRig({ txFailedReads: 5, lastSuccessfulRead: null, now: NOW })
      .should.equal(false);
  });
});

should(true).be.ok();
