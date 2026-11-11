/* global describe it */

const should = require('should');
const moment = require('moment');

const sensorSession = require('../sensorSession');

const DAY_MIN = 24 * 60;

describe('sensorSession', () => {
  describe('sessionLengthMinutes', () => {
    it('uses the length a G7 reports (15-day: 15 d + 12 h grace)', () => {
      sensorSession.sessionLengthMinutes('1234', 1339200).should.equal(15.5 * DAY_MIN);
    });

    it('uses the length a G7 reports (10-day: 10 d + 12 h grace)', () => {
      sensorSession.sessionLengthMinutes('1234', 907200).should.equal(10.5 * DAY_MIN);
    });

    it('assumes the shorter 10.5 day G7 until the sensor reports its length', () => {
      sensorSession.sessionLengthMinutes('1234', null).should.equal(10.5 * DAY_MIN);
    });

    it('keeps 10 days for G6 and 7 days for G5', () => {
      sensorSession.sessionLengthMinutes('8G1234', null).should.equal(10 * DAY_MIN);
      sensorSession.sessionLengthMinutes('4G1234', null).should.equal(7 * DAY_MIN);
    });
  });

  describe('nsStopReason', () => {
    const start = moment('2026-11-08T10:00:00Z');

    it('stops a G6 session when Sensor Insert is logged after the session start', () => {
      sensorSession.nsStopReason({
        txId: '8G1234', sessionStart: start, sensorInsert: moment(start).add(20, 'minutes'), sensorStop: null,
      }).should.equal('insert');
    });

    it('stops a G6 session when Sensor Stop is logged after the session start', () => {
      sensorSession.nsStopReason({
        txId: '8G1234', sessionStart: start, sensorInsert: null, sensorStop: moment(start).add(1, 'day'),
      }).should.equal('stop');
    });

    it('allows 6 minutes between session start and Sensor Insert', () => {
      should(sensorSession.nsStopReason({
        txId: '8G1234', sessionStart: start, sensorInsert: moment(start).add(5, 'minutes'), sensorStop: null,
      })).equal(null);
    });

    // A G7 session starts at insertion and cannot be stopped from the rig, so
    // NS treatments must not trigger a stop on every reading.
    it('never stops a G7 session from NS treatments', () => {
      should(sensorSession.nsStopReason({
        txId: '1234', sessionStart: start, sensorInsert: moment(start).add(20, 'minutes'), sensorStop: moment(start).add(1, 'day'),
      })).equal(null);
    });
  });

  // Seen over the air: g7sim (and possibly a real G7) does not answer the
  // battery request, so the status stays stale and Lookout asked again on
  // every cycle, each time adding a ~3 s timeout to the connection.
  describe('batteryRequestDue', () => {
    const NOW = 1793532485000;
    const MIN = 60000;

    it('is due when there is no status and no recent request', () => {
      sensorSession.batteryRequestDue({ statusTime: null, lastRequestTime: null, now: NOW })
        .should.equal(true);
    });

    it('is not due again within 25 minutes of the last request, even without an answer', () => {
      sensorSession.batteryRequestDue({
        statusTime: null, lastRequestTime: NOW - 10 * MIN, now: NOW,
      })
        .should.equal(false);
    });

    it('is not due while the status is fresh', () => {
      sensorSession.batteryRequestDue({
        statusTime: NOW - 5 * MIN, lastRequestTime: null, now: NOW,
      })
        .should.equal(false);
    });

    it('is due again once both are older than 25 minutes', () => {
      sensorSession.batteryRequestDue({
        statusTime: NOW - 40 * MIN, lastRequestTime: NOW - 26 * MIN, now: NOW,
      })
        .should.equal(true);
    });
  });

  // Seen live: on a fresh start Lookout has no transmitter id until
  // `lookout id` is run; syncNS still calls checkSensorSession, and
  // isG7(undefined) crashed the collector.
  describe('with no transmitter id yet', () => {
    it('does not stop anything', () => {
      should(sensorSession.nsStopReason({
        txId: undefined, sessionStart: moment(), sensorInsert: moment().add(1, 'hour'), sensorStop: null,
      })).equal(null);
      sensorSession.canStopSession(undefined).should.equal(false);
      sensorSession.canStopSession(null).should.equal(false);
    });

    it('still returns a session length', () => {
      sensorSession.sessionLengthMinutes(undefined, null).should.be.a.Number();
    });
  });

  // A G7 starts its own session on insertion; with no id yet nothing can be
  // started (and the old g7Txmitter() check threw on a missing id).
  describe('canStartSession', () => {
    it('is false for G7 and when there is no id', () => {
      sensorSession.canStartSession('1234').should.equal(false);
      sensorSession.canStartSession(undefined).should.equal(false);
    });

    it('is true for G5/G6', () => {
      sensorSession.canStartSession('8G1234').should.equal(true);
    });
  });

  describe('canStopSession', () => {
    it('is false for G7 (no stop command; xdrip-js ignores StopSensor)', () => {
      sensorSession.canStopSession('1234').should.equal(false);
    });

    it('is true for G5/G6', () => {
      sensorSession.canStopSession('8G1234').should.equal(true);
    });
  });
});

should(true).be.ok();
