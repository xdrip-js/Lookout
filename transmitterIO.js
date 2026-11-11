const cp = require('child_process');
const moment = require('moment');

const Debug = require('debug');

const log = Debug('transmitterIO:log');
const error = Debug('transmitterIO:error');
const debug = Debug('transmitterIO:debug');

const _ = require('lodash');
const calibration = require('./calibration');
const sensorSession = require('./sensorSession');
const rigHealth = require('./rigHealth');
const displaySlot = require('./displaySlot');
const { backfillRequest } = require('./backfillRequest');
const { WORKER_EXEC_ARGV } = require('./workerArgs');
const xDripAPS = require('./xDripAPS')();

// reading interval and derived timeouts (5 min / 6.5 min unless
// LOOKOUT_CYCLE_SECONDS is set for a lab simulator)
const { timing } = require('./cycle');
const { postToLocalXdrip } = require('./rigOutputs');

const FIVE_MINUTES = timing.cycleMs;
const RESTART_LISTEN_TIME = timing.workerTimeoutMs;

module.exports = async (options, storage, client, fakeMeter) => {
  let txId;
  let sensorKey;
  let txFailedReads = 0;
  let txStatus = null;
  let txFirmware = null;
  // G7 session length (incl. grace) reported by the sensor; distinguishes 10/15-day
  let txSessionLengthSeconds = null;
  // G7 display slot the current worker uses (for failure hints)
  let currentDisplayType = null;
  // when BatteryStatus was last queued (it may never be answered)
  let lastBatteryRequest = null;
  let pending = [];
  let worker = null;
  let timerObj = null;
  let lastSuccessfulTxmitterCalTime = null;
  let lastSuccessfulRead = null;

  const transmitterInSession = (sgv) => {
    if (sgv && ('inSession' in sgv) && sgv.inSession) {
      return true;
    }
    return false;
  };

  const sessionLength = () => sensorSession.sessionLengthMinutes(txId, txSessionLengthSeconds);

  const autoStopSession = (glucoseHist) => {
    if (!options.auto_stop || (glucoseHist.length === 0) || !sensorSession.canStopSession(txId)) {
      return false;
    }

    const lastSGV = glucoseHist[glucoseHist.length - 1];

    if (!lastSGV.sessionStartDate) {
      return false;
    }

    const sessionEndTime = moment(lastSGV.sessionStartDate);

    sessionEndTime.add(sessionLength(), 'minutes');

    const minutesRemaining = sessionEndTime.diff(moment(), 'minutes');

    if (minutesRemaining > 15) {
      return false;
    }

    return true;
  };

  const filterPending = (oldPending) => {
    let haveBatteryStatus = false;
    let haveFirmwareRequest = false;

    const newPending = oldPending.filter((msg) => {
      // Don't send stop or start sensors older than 2 hours and 12 minutes
      if (((msg.type === 'StopSensor') || (msg.type === 'StartSensor')) && ((Date.now() - msg.date) > 132 * 60000)) {
        return false;
      }

      // Don't send other messages older than 12 minutes
      if (((msg.type !== 'StopSensor') && (msg.type !== 'StartSensor')) && (Date.now() - msg.date) > 12 * 60000) {
        return false;
      }

      // Don't send any commands if in read only mode
      if (options.read_only && (msg.type !== 'BatteryStatus')) {
        return false;
      }

      if (msg.type === 'BatteryStatus') {
        // informational: try it on one connection only, don't retry each cycle
        if (haveBatteryStatus || (Date.now() - msg.date) > 2 * FIVE_MINUTES) {
          return false;
        }

        haveBatteryStatus = true;
      }

      if (msg.type === 'VersionRequest') {
        if (haveFirmwareRequest) {
          return false;
        }

        haveFirmwareRequest = true;
      }

      return true;
    });

    return newPending;
  };

  const sgvGaps = (rigSGVs) => {
    const now = moment().valueOf();
    const minDate = moment().subtract(24, 'hours').valueOf();

    const rigGaps = [];

    if (rigSGVs && (rigSGVs.length > 0)) {
      let prevTime = rigSGVs[0].readDateMills;

      for (let i = 1; i < rigSGVs.length; i += 1) {
        // Add 1 minute to gapStart and subtract 1 minute from gapEnd to prevent duplicats
        const gap = {
          gapStart: moment(prevTime + timing.gapMarginMs),
          gapEnd: moment(rigSGVs[i].readDateMills - timing.gapMarginMs),
        };
        if ((rigSGVs[i].readDateMills - prevTime) > timing.gapMs) {
          rigGaps.push(gap);
        }

        prevTime = rigSGVs[i].readDateMills;
      }

      if ((now - prevTime) > timing.gapMs) {
        // Add 1 minute to gapStart to prevent duplicats
        rigGaps.push({ gapStart: moment(prevTime + timing.gapMarginMs), gapEnd: moment(now) });
      }
    } else {
      // Add 1 minute to gapStart to prevent duplicats
      rigGaps.push({ gapStart: moment(minDate + 60000), gapEnd: moment(now) });
    }

    return rigGaps;
  };

  const getGlucose = async () => {
    const glucoseHist = await storage.getArray('glucoseHist');

    if (glucoseHist.length > 0) {
      return glucoseHist[glucoseHist.length - 1];
    }

    return null;
  };

  // Return true if there is no SGV or the most recent SGV was received from transmitter
  // Also return true if the latest SGV we have is more than 15 minutes old
  // Return false if most recent SGV was received from NS
  const isControlling = async (sgv) => {
    let latestSgv = sgv;

    if (!latestSgv) {
      latestSgv = await getGlucose();
    }

    // inSession is only in the SGV record if it came from transmitter
    if (!latestSgv || (typeof latestSgv.inSession !== 'undefined')) {
      return true;
    }

    if ((moment().valueOf() - latestSgv.readDateMills) > 15 * 60000) {
      return true;
    }

    return false;
  };

  const rebootRig = async () => {
    if (await isControlling()) {
      error(
        '\n====================================\n'
        + `Too many read failures: ${txFailedReads} failures, rebooting rig`
        + '\n====================================',
      );

      cp.exec('bash -c "wall Rebooting Due to Transmitter Read Errors; sleep 5; shutdown -r now"', (err, stdout, stderr) => {
        if (err) {
          error(`Unable to reboot rig: - ${err}`);
          return;
        }

        debug(`stdout: ${stdout}`);
        debug(`stderr: ${stderr}`);
      });
    } else {
      error(
        '\n====================================\n'
        + `Too many read failures: ${txFailedReads} failures, but not rebooting because not controlling rig\n`
        + '\n====================================',
      );
    }
  };

  const stopSensorSession = async (stopTime, reason) => {
    const now = moment();
    let stopWhen = stopTime || now;

    // if the commanded stop time is older than 2 hours, use current time - 120 minutes
    if (stopTime?.diff(now, 'minutes') > 132) {
      stopWhen = moment(now.valueOf() - 120 * 60000);
    }

    const sensorStop = {
      date: stopWhen,
      notes: reason,
    };

    await storage.setEvent('sensorStop', sensorStop)
      .catch((err) => {
        error(`Unable to store sensorStop: ${err}`);
      });

    await calibration.clearCalibration(storage);
  };

  const stopTransmitterSession = (stopTime) => {
    const twoAgo = moment().subtract(2, 'hours');

    const stopWhen = stopTime || twoAgo;

    // Stop sensor 2 hours prior to now to enable a rapid restart
    // if one is desired.
    pending.push({ date: stopWhen.valueOf(), type: 'StopSensor' });

    pending = filterPending(pending);

    client.newPending(pending);
  };

  // Checks whether the current sensor session should end based on
  // the latest sensor stop and sensor insert records.
  const checkSensorSession = async (sensorInsert, sensorStop, bgChecks, sgv) => {
    let sessionStart = null;
    let reason = null;
    const txmitterInSession = transmitterInSession(sgv);

    if (txmitterInSession) {
      // this is only true if we are the controlling rig AND the transmitter has an active session
      sessionStart = moment(sgv.sessionStartDate);
    }

    const stopReason = sensorSession.nsStopReason({
      txId, sessionStart, sensorInsert, sensorStop,
    });

    if (txmitterInSession && stopReason) {
      // give a 2 hour play between the sensor insert record
      // and the session start date from the transmitter
      if (stopReason === 'insert') {
        reason = '\n===================================='
          + `\nSensor Insert, ${sensorInsert.format()}, is after Sensor Start, ${sessionStart.format()}`
          + '\nStopping Sensor Session'
          + '\n====================================';
      } else {
        reason = '\n===================================='
          + `\nSensor Stop, ${sensorStop.format()}, is after Sensor Start, ${sessionStart.format()}`
          + '\nStopping Sensor Session'
          + '\n====================================';
      }

      log(reason);

      debug(`Session Start: ${sessionStart} sensorStart: ${sensorInsert} sensorStop: ${sensorStop}`);
      stopTransmitterSession(sensorStop);
      await stopSensorSession(sensorStop, reason);
    } else if (isControlling(sgv)) {
      const haveCal = await calibration.haveCalibration(storage);

      let latestBgCheckTime = null;

      if (bgChecks && (bgChecks.length > 0)) {
        latestBgCheckTime = moment(bgChecks[bgChecks.length - 1].dateMills);
      }

      const haveValidCal = await calibration.validateCalibration(
        options,
        storage,
        sensorInsert,
        sensorStop,
        latestBgCheckTime,
      );

      if (haveCal && !haveValidCal) {
        reason = '\n===================================='
          + '\nTransmitter not in session and found sensor change, start, or stop after latest calibration and transmitter not in session. Stopping Sensor Session.'
          + '\nSee calibration log messages above for details'
          + '\n====================================';

        log(reason);

        await stopSensorSession(sensorStop, reason);
      }
    }
  };

  const inSensorSession = (sgv) => {
    if (transmitterInSession(sgv)) {
      return true;
    }

    // If the transmitter is not in a session, return whether
    // we have a valid set of calibration values
    return calibration.haveCalibration(storage);
  };

  const startSession = async (startTime, sensorSerialCode, reason) => {
    const sgv = await getGlucose();

    log(
      '\n===================================='
      + `\nAttempting to start sensor session at time: ${moment(startTime).format()}`
      + '\n====================================',
    );

    if (!inSensorSession(sgv)) {
      // Only enter a sensorStart if we aren't
      // in either a transmitter session, extend session, or expired session
      await storage.setEvent(
        'sensorStart',
        {
          date: moment(),
          notes: reason,
        },
      )
        .catch((err) => {
          error(`Error setting rig sensorStart: ${err}`);
        });
    }

    if (!transmitterInSession(sgv)) {
      let startPending = false;

      _.each(pending, (cmd) => {
        if (cmd.type === 'StartSensor') {
          startPending = true;
        }
      });

      if (!startPending) {
        pending.push({ date: startTime, type: 'StartSensor', sensorSerialCode });

        pending = filterPending(pending);

        client.newPending(pending);
      }
    }
  };

  const sendNewGlucose = async (sgv, sendToXdrip) => {
    client.newSGV(sgv);

    if (sgv.glucose) {
      // wait for fakeMeter to finish so it doesn't interfere with
      // pump-loop
      await fakeMeter.glucose(sgv.glucose);
    }

    const toNS = options.nightscout && !options.read_only;
    xDripAPS.post(sgv, postToLocalXdrip(options, sendToXdrip), toNS);
  };

  const sendCGMStatus = async (sgv, bgChecks) => {
    let latestBGCheckTime = null;

    if (bgChecks.length > 0) {
      latestBGCheckTime = bgChecks[bgChecks.length - 1].dateMills;
    }

    const activeCal = await calibration.getActiveCal(options, storage);

    if (options.nightscout) {
      xDripAPS.postStatus(txId, sgv, txStatus, activeCal, latestBGCheckTime, options.battery);
    }
  };

  // Store the last 24 hours of glucose readings
  const storeNewGlucose = async (glucoseHist, sgv) => {
    glucoseHist.push(sgv);

    let newGlucoseHist = _.sortBy(glucoseHist, ['readDateMills']);

    const minDate = moment().subtract(24, 'hours').valueOf();
    let sliceStart = 0;

    // store the last 24 hours of glucose
    // history is used to determine trend and noise values
    // and back fill nightscout.
    for (let i = 0; i < newGlucoseHist.length; i += 1) {
      if (newGlucoseHist[i].readDateMills < minDate) {
        sliceStart = i + 1;
      }
    }

    newGlucoseHist = newGlucoseHist.slice(sliceStart);

    await storage.setItem('glucoseHist', newGlucoseHist)
      .catch((err) => {
        error(`Unable to store glucoseHist: ${err}`);
      });
  };

  const txStatusString = (state) => {
    switch (state) {
      case null:
        return 'None';
      case 0x00:
        return 'OK';
      case 0x81:
        return 'Low battery';
      case 0x83:
        return 'Expired';
      default:
        return state ? `Unknown: 0x${state.toString(16)}` : '--';
    }
  };

  const txStatusStringShort = (state) => {
    switch (state) {
      case null:
        return '--';
      case 0x00:
        return 'OK';
      case 0x81:
        return 'Low bat';
      case 0x83:
        return 'Expired';
      default:
        return state ? `Unknown: 0x${state.toString(16)}` : '--';
    }
  };

  const stateString = (sgv) => {
    let state = null;

    switch (sgv.state) {
      case 0x00:
        state = 'None';
        break;
      case 0x01:
        state = 'Stopped';
        break;
      case 0x02:
        state = 'Warmup';
        break;
      case 0x03:
        state = 'Unused';
        break;
      case 0x04:
        state = 'First calibration';
        break;
      case 0x05:
        state = 'Second calibration';
        break;
      case 0x06:
        state = 'OK';
        break;
      case 0x07:
        state = 'Need calibration';
        break;
      case 0x08:
        state = 'Calibration Error 1';
        break;
      case 0x09:
        state = 'Calibration Error 0';
        break;
      case 0x0a:
        state = 'Calibration Linearity Fit Failure';
        break;
      case 0x0b:
        state = 'Sensor Failed Due to Counts Aberration';
        break;
      case 0x0c:
        state = 'Sensor Failed Due to Residual Aberration';
        break;
      case 0x0d:
        state = 'Out of Calibration Due To Outlier';
        break;
      case 0x0e:
        state = 'Outlier Calibration Request - Need a Calibration';
        break;
      case 0x0f:
        state = 'Session Expired';
        break;
      case 0x10:
        state = 'Session Failed Due To Unrecoverable Error';
        break;
      case 0x11:
        state = 'Session Failed Due To Transmitter Error';
        break;
      case 0x12:
        state = 'Temporary Session Failure - ???';
        break;
      case 0x13:
        state = 'Reserved';
        break;
      case 0x15:
        state = 'Sensor Failed';
        break;
      case 0x16:
        state = 'Sensor Failed Start';
        break;
      case 0x17:
        state = 'Sensor Failed Start2';
        break;
      case 0x18:
        state = 'Sensor Expired';
        break;
      case 0x19:
        state = 'Sensor Failed 7';
        break;
      case 0x1A:
        state = 'Sensor Stopped 2';
        break;
      case 0x1B:
        state = 'Sensor Failed 8';
        break;
      case 0x1C:
        state = 'Sensor Failed 9';
        break;
      case 0x1D:
        state = 'Sensor Failed 10';
        break;
      case 0x1E:
        state = 'Sensor Failed 11';
        break;
      case 0x80:
        state = 'Calibration State - Start';
        break;
      case 0x81:
        state = 'Calibration State - Start Up';
        break;
      case 0x82:
        state = 'Calibration State - First of Two Calibrations Needed';
        break;
      case 0x83:
        state = 'Calibration State - High Wedge Display With First BG';
        break;
      case 0x84:
        state = 'Unused Calibration State - Low Wedge Display With First BG';
        break;
      case 0x85:
        state = 'Calibration State - Second of Two Calibrations Needed';
        break;
      case 0x86:
        state = 'Calibration State - In Calibration Transmitter';
        break;
      case 0x87:
        state = 'Calibration State - In Calibration Display';
        break;
      case 0x88:
        state = 'Calibration State - High Wedge Transmitter';
        break;
      case 0x89:
        state = 'Calibration State - Low Wedge Transmitter';
        break;
      case 0x8a:
        state = 'Calibration State - Linearity Fit Transmitter';
        break;
      case 0x8b:
        state = 'Calibration State - Out of Cal Due to Outlier Transmitter';
        break;
      case 0x8c:
        state = 'Calibration State - High Wedge Display';
        break;
      case 0x8d:
        state = 'Calibration State - Low Wedge Display';
        break;
      case 0x8e:
        state = 'Calibration State - Linearity Fit Display';
        break;
      case 0x8f:
        state = 'Calibration State - Session Not in Progress';
        break;
      default:
        state = sgv.state ? `Unknown: 0x${sgv.state.toString(16)}` : '--';
    }

    return state;
  };

  const stateStringShort = (sgv) => {
    let state = null;

    switch (sgv.state) {
      case 0x00:
        state = 'None';
        break;
      case 0x01:
        state = 'Stopped';
        break;
      case 0x02:
        state = 'Warmup';
        break;
      case 0x03:
        state = 'Unused';
        break;
      case 0x04:
        state = '1st Cal';
        break;
      case 0x05:
        state = '2nd Cal';
        break;
      case 0x06:
        state = 'OK';
        break;
      case 0x07:
        state = 'Need Cal';
        break;
      case 0x08:
        state = 'Cal Err 1';
        break;
      case 0x09:
        state = 'Cal Err 0';
        break;
      case 0x0a:
        state = 'Cal Lin Fit';
        break;
      case 0x0b:
        state = 'Fail Counts';
        break;
      case 0x0c:
        state = 'Fail Resid';
        break;
      case 0x0d:
        state = 'Outlier';
        break;
      case 0x0e:
        state = 'Cal NOW';
        break;
      case 0x0f:
        state = 'Expired';
        break;
      case 0x10:
        state = 'Unrecoverable';
        break;
      case 0x11:
        state = 'Failed Tx';
        break;
      case 0x12:
        state = 'Temp Fail';
        break;
      case 0x13:
        state = 'Reserved';
        break;
      case 0x15:
        state = 'Sensor Failed';
        break;
      case 0x16:
        state = 'Failed Start';
        break;
      case 0x80:
        state = 'Cal - Start';
        break;
      case 0x81:
        state = 'Cal - Start Up';
        break;
      case 0x82:
        state = '1 of 2 Cal';
        break;
      case 0x83:
        state = 'Hi Wedge Display';
        break;
      case 0x84:
        state = 'Unused Cal';
        break;
      case 0x85:
        state = '2 of 2 Cal';
        break;
      case 0x86:
        state = 'In Cal Tx';
        break;
      case 0x87:
        state = 'In Cal Display';
        break;
      case 0x88:
        state = 'Hi Wedge Tx';
        break;
      case 0x89:
        state = 'Lo Wedge Tx';
        break;
      case 0x8a:
        state = 'Lin Fit Tx';
        break;
      case 0x8b:
        state = 'Outlier Cal Tx';
        break;
      case 0x8c:
        state = 'Hi Wedge Display';
        break;
      case 0x8d:
        state = 'Lo Wedge Display';
        break;
      case 0x8e:
        state = 'Lin Fit Display';
        break;
      case 0x8f:
        state = 'No Session';
        break;
      default:
        state = sgv.state ? `Unknown: 0x${sgv.state.toString(16)}` : '--';
    }

    if (options.include_mode && sgv.inExtendedSession) {
      state += '-ext';
    } else if (options.include_mode && sgv.inExpiredSession) {
      state += '-exp';
    }

    return state;
  };

  const processNewGlucose = async (newSgv, startingSession) => {
    let glucoseHist = null;
    let sensorInsertDate = null;
    let sensorStopDate = null;
    let sendSGV = true;

    let sgv = _.cloneDeep(newSgv);

    let sensorInsert = await storage.getEvent('sensorInsert')
      .catch((err) => {
        error(`Error getting rig sensorInsert: ${err}`);
      });

    let sensorStart = await storage.getEvent('sensorStart')
      .catch((err) => {
        error(`Error getting rig sensorStart: ${err}`);
      });

    if (transmitterInSession(sgv)) {
      const txmitterSessionStart = moment(sgv.sessionStartDate);
      let updatedStart = false;

      // If we don't have a sensor start, use the transmitter's session start
      // Else, check if the sensor session start time reported by the transmitter is
      // after the stored sensor start.
      if (!sensorStart) {
        sensorStart = {
          date: txmitterSessionStart,
          notes: 'Transmitter Reported Start Time',
        };

        updatedStart = true;
      } else if (txmitterSessionStart.diff(sensorStart.date, 'hours') > 2) {
        log(
          '\n===================================='
          + '\nTransmitter session start date more than 2 hours after stored sensorStart'
          + `\nSetting stored sensorStart to ${txmitterSessionStart.format()}`
          + '\n====================================',
        );
        sensorStart = {
          date: txmitterSessionStart,
          notes: 'Transmitter Reported Start Time',
        };

        updatedStart = true;
      }

      if (updatedStart) {
        storage.setEvent('sensorStart', sensorStart)
          .catch((err) => {
            error(`Error saving rig sensorStart: ${err}`);
          });
      }
    }

    if (sensorStart) {
      debug(`SyncNS Rig sensor start - date: ${sensorStart.date.format()}`);

      if (!sensorInsert || (sensorStart.date.valueOf() > sensorInsert.date.valueOf())) {
        // allow the user to enter either to reset the session.
        sensorInsert = sensorStart;
      }
    }

    if (sensorInsert) {
      sensorInsertDate = sensorInsert.date;
    }

    const sensorStop = await storage.getEvent('sensorStop')
      .catch((err) => {
        error(`Error getting rig sensorStop: ${err}`);
      });

    if (sensorStop) {
      debug(`SyncNS Rig sensor stop - date: ${sensorStop.date.format()}`);
      sensorStopDate = sensorStop.date;
    }

    await storage.lock();

    sgv.readDateMills = moment(sgv.readDate).valueOf();

    const bgChecks = await storage.getArray('bgChecks')
      .catch((err) => {
        error(`Error getting bgChecks: ${err}`);
      });

    await checkSensorSession(sensorInsertDate, sensorStopDate, bgChecks, sgv);

    glucoseHist = await storage.getArray('glucoseHist')
      .catch((err) => {
        error(`Error getting glucoseHist: ${err}`);
      });

    sgv = await calibration.calibrateGlucose(
      storage,
      options,
      sensorInsertDate,
      sensorStopDate,
      glucoseHist,
      sgv,
    );

    if (sgv.inExtendedSession) {
      sgv.mode = 'extended cal';
      // set the sessionStartDate from the known start since transmitter
      // no longer reports it
      sgv.sessionStartDate = sensorStart.date.format();
    } else if (sgv.inExpiredSession) {
      sgv.mode = 'expired cal';
      // set the sessionStartDate from the known start since transmitter
      // no longer reports it
      sgv.sessionStartDate = sensorStart.date.format();
    } else {
      sgv.mode = 'txmitter cal';
    }

    // Only override the state if expired calibration enabled
    // Otherwise, the session would be immediately stopped if a BG Check is entered
    if (sgv.state === 0x1 && options.expired_cal
      && (sgv.inExtendedSession || sgv.inExpiredSession)) {
      if (moment().diff(sensorStart.date, 'days') <= 4 && bgChecks.length > 0 && moment().diff(moment(bgChecks[bgChecks.length - 1].dateMills), 'hours') > 12) {
        // set session state to Need Calibration - cal every 12 hours for first 4 days
        sgv.state = 0x7;
      } else if (moment().diff(sensorStart.date, 'days') > 4 && bgChecks.length > 0 && moment().diff(moment(bgChecks[bgChecks.length - 1].dateMills), 'hours') > 24) {
        // set session state to Need Calibration - cal every 24 hours after first 4 days
        sgv.state = 0x7;
      } else {
        // set session state to OK
        sgv.state = 0x6;
      }
    }

    sgv.stateString = stateString(sgv);
    sgv.stateStringShort = stateStringShort(sgv);

    sgv.txStatusString = txStatusString(sgv.status);
    sgv.txStatusStringShort = txStatusStringShort(sgv.status);

    log(`sensor state: ${sgv.stateString}`);

    if (glucoseHist.length > 0) {
      const prevSgv = await getGlucose();

      // Only test if there is a validate state in the prevSgv
      if ((!prevSgv || (prevSgv.state && (sgv.state !== prevSgv.state))) && options.nightscout) {
        xDripAPS.postAnnouncement(`Sensor: ${sgv.stateString}`);
      } else if (startingSession && sgv.state !== 0x02) {
        xDripAPS.postAnnouncement(`Unable to Start Session: ${sgv.stateString} should have been 'Warmup'`);
        log('============================================='
          + '\nLookout sent start session command to transmitter; however,'
          + '\ntransmitter did not start the session. Possible causes:'
          + '\n  * Attempting to back start session at a time prior to the transmitter start time'
          + '\n  * Attempting to back start session at a time prior to the prior session stop time'
          + '\n  * Attempting to back start session (sometimes it just does not work)'
          + '\n  * Previous session not stopped'
          + '\n=============================================');
      }
    }

    if (!sgv.glucose || sgv.glucose < 20) {
      sgv.glucose = null;
      log('No valid glucose to send.');
      sendSGV = false;
    }

    await storeNewGlucose(glucoseHist, sgv)
      .catch(() => {
        error('Unable to store new glucose');
      });

    storage.unlock();

    sendCGMStatus(sgv, bgChecks);

    sendNewGlucose(sgv, sendSGV);
  };

  const processTxmitterCalData = async (calData) => {
    let bgChecks = null;
    let bgCheckIdx = -1;

    const newCal = {
      date: calData.date,
      dateMills: moment(calData.date).valueOf(),
      glucose: calData.glucose,
    };

    log(`Last calibration: ${Math.round(((Date.now() - newCal.dateMills) / 1000 / 60 / 60) * 10) / 10} hours ago, ${newCal.glucose} mg/dL`);

    if (newCal.glucose > 400 || newCal.glucose < 20) {
      log('Txmitter Last Calibration Data glucose out of range - ignoring');
      return;
    }

    const rigSGVs = await storage.getArray('glucoseHist')
      .catch((err) => {
        error(`Error getting rig SGVs: ${err}`);
      });

    if (rigSGVs.length < 1) {
      // we really shouldn't have gotten to this
      // state, but bail since we don't have any
      // glucose history to work with
      return;
    }

    const latestSGV = rigSGVs[rigSGVs.length - 1];

    // check the sensor state
    // don't use this cal message data
    // if sensor state isn't OK or Need Calibration
    // In stopped state and maybe other states,
    // the last calibration data is not valid
    if ((latestSGV.state !== 0x06) && (latestSGV.state !== 0x07)) {
      return;
    }

    newCal.type = 'Txmitter';

    await storage.lock();

    bgChecks = await storage.getArray('bgChecks')
      .catch((err) => {
        error(`Error getting bgChecks: ${err}`);
      });

    // Look through the BG Checks we have to see if we already
    // have this BG Check
    for (let i = (bgChecks.length - 1); i >= 0; i -= 1) {
      if (Math.abs(bgChecks[i].dateMills - newCal.dateMills) < 2 * 60 * 1000) {
        // The CGM transmitter report varies the time around
        // the real time a little between read events.
        // If they are within two minutes, assume it's the same
        // check and bail out.

        if (bgChecks[i].unfiltered) {
          // If it already has a unfiltered value
          // we have already completed processing
          // it.
          storage.unlock();

          return;
        }
        // break out of the loop, but try to find
        // the unfiltered value
        bgCheckIdx = i;
      }
    }

    const sensorStart = await storage.getEvent('sensorStart')
      .catch((err) => {
        error(`Error getting rig sensorStart: ${err}`);
      });

    let sensorInsert = await storage.getEvent('sensorInsert')
      .catch((err) => {
        error(`Error getting rig sensorInsert: ${err}`);
      });

    if (sensorStart) {
      if (!sensorInsert || (sensorStart.date.valueOf() > sensorInsert.date.valueOf())) {
        // allow the user to enter either to reset the session.
        sensorInsert = sensorStart;
      }
    }

    const valueTime = moment(newCal.date);

    if (sensorInsert && (sensorInsert.date.diff(valueTime) > 0)) {
      // The calibration value pre-dates the NS sensorInsert record
      // Bail out.

      storage.unlock();

      return;
    }

    const raw = await calibration.getUnfiltered(valueTime, rigSGVs);

    if (raw) {
      newCal.unfiltered = raw.unfiltered;
      newCal.filtered = raw.filtered;
    }

    if (bgCheckIdx >= 0) {
      // We already had this bgCheck but didn't have the unfiltered value
      bgChecks[bgCheckIdx].unfiltered = newCal.unfiltered;
      bgChecks[bgCheckIdx].filtered = newCal.filtered;
      bgChecks[bgCheckIdx].type = newCal.type;
    } else {
      // This is a new bgCheck we didn't already have
      bgChecks.push(newCal);

      bgChecks = _.sortBy(bgChecks, ['dateMills']);

      client.newCal(newCal);
    }

    storage.setItem('bgChecks', bgChecks)
      .catch((err) => {
        error(`Error saving bgChecks: ${err}`);
      });

    storage.unlock();
  };

  const processBatteryStatus = (batteryStatus) => {
    txStatus = batteryStatus;

    txStatus.timestamp = moment();

    log('Got battery status message:\n%O', txStatus);
  };

  const processBackfillData = async (backfillData) => {
    await storage.lock();

    let glucoseHist = await storage.getArray('glucoseHist');
    const gaps = sgvGaps(glucoseHist);

    _.each(backfillData, (glucose) => {
      const sgvDate = moment(glucose.time);

      log(`Received backfill glucose: ${glucose.glucose} time: ${sgvDate.format()}`);

      if (glucose.type === 7 || glucose.type === 6) {
        _.each(gaps, (gap) => {
          const readDateMills = sgvDate.valueOf();

          if ((gap.gapStart.diff(sgvDate) < 0) && (gap.gapEnd.diff(sgvDate) > 0)) {
            debug(`Storing backfill glucose: ${glucose.glucose} time: ${sgvDate.format()}`);

            const newSGV = {
              readDateMills,
              glucose: glucose.glucose,
              readDate: sgvDate.format(),
              trend: 0,
              state: glucose.type,
              inSession: true,
            };

            glucoseHist.push(newSGV);

            const toNS = options.nightscout && !options.read_only;
            xDripAPS.post(newSGV, postToLocalXdrip(options, true), toNS);
          }
        });
      }
    });

    glucoseHist = _.sortBy(glucoseHist, ['readDateMills']);

    await storage.setItem('glucoseHist', glucoseHist)
      .catch((err) => {
        error(`Unable to store glucoseHist: ${err}`);
      });

    storage.unlock();
  };

  // test to see if we have a BG Check that needs
  // to be entered into the pending messages
  // as a calibration.
  // Add it to pending if required.
  const calibrateFromNS = async () => {
    let latestBGCheckTime = null;
    let pendingCalTime = 0;

    const bgChecks = await storage.getArray('bgChecks')
      .catch((err) => {
        error(`Error getting bgChecks: ${err}`);
      });

    if (bgChecks.length > 0) {
      latestBGCheckTime = bgChecks[bgChecks.length - 1].dateMills;
    }

    const latestTxmitterCal = await calibration.getLastCal(storage);
    let latestTxmitterCalTime = 0;

    if (latestTxmitterCal) {
      latestTxmitterCalTime = latestTxmitterCal.dateMills;
    }

    const deltaTime = latestBGCheckTime - latestTxmitterCalTime;
    const bgCheckAge = Date.now() - latestBGCheckTime;
    const timeSinceTxmitterControl = Date.now() - lastSuccessfulRead;

    let deltaFromLastCalSent = 5 * 60000; // initialize to a large value

    _.each(pending, (msg) => {
      if (msg.type === 'CalibrateSensor') {
        pendingCalTime = msg.date;
      }
    });

    if (lastSuccessfulTxmitterCalTime) {
      deltaFromLastCalSent = Math.abs(lastSuccessfulTxmitterCalTime - pendingCalTime);
    }

    // If the following things are true, then add a calibration record to pending
    // 1. There is not already a pending calibration
    // 2. We have a transmitter calibration time from the transmitter
    // 3. The time between the last BG Check and the last transmitter calibration
    //    time is more than 5 minutes
    // 4. The time since this rig last successfully connected and read the transmitter
    //    is less than 15 minutes
    // 5. The last successful calibration send to the transmitter is not the same
    //    as the last BG Check (prevents resending it on the next read)
    // 6. The BG Check occurred in the last 30 minutes
    if (!pendingCalTime && (deltaTime > 5 * 60000) && (bgCheckAge < 30 * 60000)
      && (timeSinceTxmitterControl < 15 * 60000) && latestTxmitterCalTime
      && (deltaFromLastCalSent > 2 * 60000)) {
      const { glucose } = bgChecks[bgChecks.length - 1];
      log(`Sending calibration value to transmitter: ${glucose} at time: ${moment(latestBGCheckTime).format()}`);
      pending.push({ date: latestBGCheckTime, type: 'CalibrateSensor', glucose });
      pendingCalTime = latestBGCheckTime;
    }

    return pendingCalTime;
  };

  const listenToTransmitter = async (id) => {
    if (!id) {
      error('Unable to listen to invalid Transmitter ID');
      return;
    }

    let startingSession = false;
    let stoppingSession = false;

    if (options.sim) {
      let prevGlucose = await getGlucose();

      prevGlucose = prevGlucose ? prevGlucose.glucose : 120;

      worker = cp.fork(`${__dirname}/transmitterSimulator`, [prevGlucose], { });
    } else {
      // own Node flags: the launcher's tiny heap makes the G7 crypto ~2x slower
      const workerOptions = { execArgv: WORKER_EXEC_ARGV };
      const btChannel = options.alternate_bt_channel ? '1' : '0';
      const key = sensorKey?.key || '';
      const macAddress = sensorKey?.address || '';

      let displayType;
      try {
        displayType = displaySlot.resolveDisplayType({
          txId: id,
          displayType: options.display_type,
          alternate: options.alternate_bt_channel,
          forceMedical: options.force_medical_slot,
        });
      } catch (err) {
        error(`Not starting transmitter worker: ${err.message}`);
        return;
      }
      if (displayType) {
        log(`Using G7 display slot ${displayType}`);
      }
      currentDisplayType = displayType;

      worker = cp.fork(
        `${__dirname}/transmitterWorker`,
        [id, btChannel, key, macAddress, displayType ? String(displayType) : '',
          options.sensor_address || ''],
        workerOptions,
      );
    }

    worker.on('message', async (m) => {
      let pendingCalTime;

      if (m.msg === 'getMessages') {
        if (sensorSession.batteryRequestDue({
          statusTime: txStatus ? txStatus.timestamp.valueOf() : null,
          lastRequestTime: lastBatteryRequest,
          now: Date.now(),
        })) {
          lastBatteryRequest = Date.now();
          pending.push({ type: 'BatteryStatus', date: moment().valueOf() });
        }

        pendingCalTime = await calibrateFromNS();

        if (!txFirmware && !txSessionLengthSeconds) {
          pending.push({ type: 'VersionRequest', date: moment().valueOf() });
        }

        pending = filterPending(pending);

        const glucoseHist = await storage.getArray('glucoseHist');
        const gaps = sgvGaps(glucoseHist);

        const backfill = backfillRequest({
          gaps,
          now: moment(),
          inSession: Boolean(glucoseHist && glucoseHist.length
            && transmitterInSession(glucoseHist[glucoseHist.length - 1])),
          hasHistory: Boolean(glucoseHist && glucoseHist.length),
          cycleMs: FIVE_MINUTES,
        });
        if (backfill && backfill.start) {
          log(`Requesting backfill - start: ${backfill.start.format()} end: ${backfill.end.format()}`);
          pending.push({ type: 'Backfill', date: backfill.start.valueOf(), endDate: backfill.end.valueOf() });
        } else if (backfill) {
          log(`Not requesting backfill - ${backfill.skip}`);
        }

        _.each(pending, (msg) => {
          if (msg.type === 'StartSensor') {
            startingSession = true;
          } else if (msg.type === 'StopSensor') {
            stoppingSession = true;
          }
        });

        if (!stoppingSession && autoStopSession(glucoseHist)) {
          const stopWhen = moment().subtract(2, 'hours');

          // Stop sensor 2 hours prior to now to enable a rapid restart
          // if one is desired.
          log(
            '\n====================================\n'
            + 'Automatically Stopping Session'
            + '\n====================================',
          );

          pending.push({ date: stopWhen.valueOf(), type: 'StopSensor' });
        }

        stoppingSession = false;

        worker.send(pending);
        // NOTE: this will lead to missed messages if the rig
        // shuts down before acting on them, or in the
        // event of lost comms
        // better to return something from the worker

        pending = filterPending(pending);

        client.newPending(pending);
      } else if (m.msg === 'glucose') {
        const glucose = m.data;
        glucose.readDateMills = moment(glucose.readDate).valueOf();

        if (txStatus) {
          glucose.voltagea = txStatus.voltagea;
          glucose.voltageb = txStatus.voltageb;
          glucose.voltageTime = txStatus.timestamp.valueOf();
          glucose.temperature = txStatus.temperature;
          glucose.resistance = txStatus.resist;
        }

        log(`got glucose: ${glucose.glucose} unfiltered: ${glucose.unfiltered / 1000}`);

        lastSuccessfulRead = glucose.readDateMills;
        // restart txFailedReads counter since we were successfull
        txFailedReads = 0;

        log(
          '\n====================================\n'
          + 'Received Glucose Message'
          + '\n====================================',
        );

        processNewGlucose(glucose, startingSession);
      } else if (m.msg === 'messageProcessed') {
        // TODO: check that dates match

        if (pendingCalTime === m.date) {
          lastSuccessfulTxmitterCalTime = pendingCalTime;
        }

        pending.shift();
        client.newPending(pending);
      } else if (m.msg === 'calibrationData') {
        processTxmitterCalData(m.data);
      } else if (m.msg === 'batteryStatus') {
        processBatteryStatus(m.data);
      } else if (m.msg === 'version') {
        txFirmware = m.data.firmwareVersion;
        if (m.data.sessionLengthSeconds > 0) {
          txSessionLengthSeconds = m.data.sessionLengthSeconds;
        }
        log('Version message:\n%O', m.data);
      } else if (m.msg === 'sawTransmitter') {
        // increment failed reads counter so we know how many
        // times we saw the transmitter
        txFailedReads += 1;
      } else if (m.msg === 'backfillData') {
        processBackfillData(m.data);
      } else if (m.msg === 'sensorKey') {
        sensorKey = m.data;

        await storage.lock();
        await storage.setItem('sensorKey', m.data)
          .catch((err) => {
            error(`Unable to store sensorKey: ${err}`);
          });
        await storage.unlock();
      }
    });

    worker.on('exit', () => {
      worker = null;

      // Receive results from child process
      log('exited');

      if (timerObj !== null) {
        clearTimeout(timerObj);
      }

      const now = Date.now();

      const slotHint = displaySlot.slotFailureHint({
        txId, displayType: currentDisplayType, failedReads: txFailedReads,
      });
      if (slotHint) {
        error(slotHint);
      }

      if (rigHealth.shouldRebootRig({
        txFailedReads, lastSuccessfulRead, now, rebootAfterMs: timing.rebootAfterMs,
      })) {
        // Automatically reboot on the 2nd failed read
        rebootRig();
      }

      const elapsedMs = now - lastSuccessfulRead;

      // Time until the next 5-minute boundary since lastSuccessfulRead
      const timeUntilNextRead = (FIVE_MINUTES - (elapsedMs % FIVE_MINUTES)) % FIVE_MINUTES;

      // Start the worker timing.preWakeMs before the next read
      let timeUntilTarget = timeUntilNextRead - timing.preWakeMs;

      // Cannot wait until a time before now - nobody has invented a time machine
      if (timeUntilTarget < 0) {
        timeUntilTarget = 0;
      }

      const totalSeconds = Math.floor(timeUntilTarget / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;

      log(`Starting new worker in ${minutes} minutes and ${seconds} seconds`);

      timerObj = setTimeout(() => {
        // Restart the worker after 1 minute
        listenToTransmitter(txId);
      }, timeUntilTarget);
    });

    timerObj = setTimeout(() => {
      // After 6 minutes, kill the worker if it hasn't already exited
      // When it exits after receiving kill signal, the on exit
      // callback will fire to restart it
      if (worker !== null) {
        try {
          log('Starting new worker, but one already exists. Attempting to kill it');
          worker.kill('SIGTERM');
        } catch (err) {
          error(`Unable to kill existing worker: ${err}`);
        }
      }
    }, RESTART_LISTEN_TIME);
  };

  const changeTxId = (value) => {
    if ((value.length !== 6) && (value.length !== 4)) {
      error(`received invalid transmitter id of ${value}`);
    } else {
      sensorKey = null;
      storage.setItemSync('sensorKey', null);
      lastSuccessfulRead = null;

      if (worker !== null) {
        // When worker exits, listenToTransmitter will
        // be scheduled
        try {
          debug('Attempting to kill worker for old id');
          worker.kill('SIGTERM');
        } catch (err) {
          error(`Error killing old worker: ${err}`);
        }
      } else if (!txId) {
        // If the current txId was null,
        // then we need to start the listener
        listenToTransmitter(value);
      }

      log(`received id of ${value}`);
      txId = value;
      txFirmware = null;
      txSessionLengthSeconds = null;

      calibration.clearCalibration(storage);

      storage.setItemSync('id', txId);
    }
  };

  const g7Txmitter = () => (txId.length < 6);

  const g6Txmitter = () => (!g7Txmitter() && (txId.substr(0, 1) === '8'));

  // Create an object that can be used
  // to interact with the transmitter.
  const transmitterIO = {
    // provide the current transmitter ID
    getTxId: () => txId,

    // provide the pending list
    getPending: () => {
      pending = filterPending(pending);

      return pending;
    },

    // provide the most recent glucose reading
    getGlucose: async () => getGlucose(),

    // provide the glucose history
    getHistory: async () => {
      const glucoseHist = await storage.getArray('glucoseHist')
        .catch((err) => {
          error(`Unable to get glucoseHist storage item: ${err}`);
        });

      return glucoseHist.map((sgv) => ({ readDate: sgv.readDateMills, glucose: sgv.glucose }));
    },

    // provide the most recent Txmitter calibration
    getLastCal: async () => calibration.getLastCal(storage),

    // Reset the transmitter
    resetTx: () => {
      pending.push({ date: Date.now(), type: 'ResetTx' });

      pending = filterPending(pending);

      client.newPending(pending);
    },

    // Start a sensor session
    startSensor: (sensorSerialCode, reason) => {
      startSession(Date.now(), sensorSerialCode, reason);
    },

    // Start a sensor session at time
    startSensorTime: (startTime, reason) => {
      if (!sensorSession.canStartSession(txId)) {
        // G7 (starts itself) or no transmitter id yet
        debug(`Not starting a session for transmitter ${txId}`);
        return;
      }
      if (g6Txmitter()) {
        xDripAPS.postAnnouncement('G6 Start Unsupported by NS');
      } else {
        startSession(startTime.valueOf(), null, reason);
      }
    },

    // Start a sensor session back started 2 hours
    backStartSensor: (sensorSerialCode, reason) => {
      startSession(Date.now() - 2 * 60 * 60 * 1000, sensorSerialCode, reason);
    },

    stopSensor: async (reason) => {
      const stopTime = moment().subtract(2, 'hours');

      // Get SGV first before we call stopSensorSession
      const sgv = await getGlucose();

      await stopSensorSession(stopTime, reason);

      if (transmitterInSession(sgv)) {
        stopTransmitterSession(stopTime);
      } else {
        log('stopSensor received - no active transmitter session to end');
      }
    },

    sendBgChecksToTxmitter: (bgChecks) => {
      _.each(bgChecks, (bgCheck) => {
        pending.push({ date: bgCheck.dateMills, type: 'CalibrateSensor', glucose: bgCheck.glucose });
      });

      pending = filterPending(pending);

      client.newPending(pending);
    },

    // calibrate the sensor
    calibrate: async (glucose) => {
      const timeValue = moment();

      await storage.lock();

      let bgChecks = await storage.getArray('bgChecks')
        .catch((err) => {
          error(`Error getting bgChecks: ${err}`);
        });

      const calData = {
        date: timeValue.format(),
        dateMills: timeValue.valueOf(),
        glucose,
        type: 'GUI',
      };

      bgChecks.push(calData);

      bgChecks = _.sortBy(bgChecks, ['dateMills']);

      storage.setItem('bgChecks', bgChecks)
        .catch((err) => {
          error(`Error saving bgChecks: ${err}`);
        });

      storage.unlock();

      pending.push({ date: Date.now(), type: 'CalibrateSensor', glucose });

      if (options.nightscout) {
        xDripAPS.postBGCheck(calData);
      }

      pending = filterPending(pending);

      client.newPending(pending);
    },

    // Set the transmitter Id to the value provided
    setTxId: (value) => {
      changeTxId(value);

      client.txId(value);
    },

    checkSensorSession: async (sensorInsert, sensorStop, bgChecks, sgv) => {
      checkSensorSession(sensorInsert, sensorStop, bgChecks, sgv);
    },

    inSensorSession: async () => {
      const sgv = await getGlucose();

      return inSensorSession(sgv);
    },

    sgvGaps: (rigSGVs) => sgvGaps(rigSGVs),

    getUnfiltered: async (valueTime) => {
      const rigSGVs = await storage.getArray('glucoseHist')
        .catch((err) => {
          error(`Error getting rig SGVs: ${err}`);
        });

      return calibration.getUnfiltered(valueTime, rigSGVs);
    },
  };

  // Provide the object to the client
  client.setTransmitter(transmitterIO);

  // Read the current stored transmitter value
  txId = await storage.getItem('id');
  sensorKey = await storage.getItem('sensorKey');

  // Start the transmitter loop task
  listenToTransmitter(txId, sensorKey);

  return transmitterIO;
};
