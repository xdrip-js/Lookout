const xDripAPS = require('./xDripAPS')();
const calibration = require('./calibration');
const cp = require('child_process');
const moment = require('moment');

var _ = require('lodash');

module.exports = async (options, storage, storageLock, client, fakeMeter) => {
  let txId;
  let txFailedReads = 0;
  let txStatus = null;
  let pending = [];
  let worker = null;
  let timerObj = null;
  let lastSuccessfulTxmitterCalTime = null;
  let lastSuccessfulRead = null;

  const removeBTDevice = (id) => {
    var btName = 'Dexcom'+id.slice(-2);

    cp.exec('bt-device -r '+btName, (err, stdout, stderr) => {
      if (err) {
        console.log('Unable to remove BT Device: ' + btName+' - ' + err);
        return;
      }

      console.log('Removed BT Device: '+btName);
      console.log(`stdout: ${stdout}`);
      console.log(`stderr: ${stderr}`);
    });
  };

  const rebootRig = () => {
    console.log('============================\nRebooting rig due to too many read failures: ' + txFailedReads + ' failures.\n============================');

    cp.exec('bash -c "wall Rebooting Due to Transmitter Read Errors; sleep 5; shutdown -r now"', (err, stdout, stderr) => {
      if (err) {
        console.log('Unable to reboot rig: - ' + err);
        return;
      }

      console.log(`stdout: ${stdout}`);
      console.log(`stderr: ${stderr}`);
    });
  };

  const changeTxId = (value) => {
    if (value.length != 6) {
      console.log('received invalid transmitter id of ' + value);
    } else {
      if (worker !== null) {
        // When worker exits, listenToTransmitter will
        // be scheduled
        try {
          console.log('Attempting to kill worker for old id');
          worker.kill('SIGTERM');
        } catch (error) {
          console.log('Error killing old worker: ' + error);
        }
      } else if (!txId) {
        // If the current txId was null,
        // then we need to start the listener
        listenToTransmitter(txId);
      }

      console.log('received id of ' + value);
      txId = value;

      calibration.clearCalibration(storage);
      storage.del('glucoseHist');

      storage.setItemSync('id', txId);
    }
  };

  // Checks whether the current sensor session should end based on
  // the latest sensor stop and sensor insert records.
  const checkSensorSession = async (sensorInsert, sensorStop, bgChecks, sgv) => {
    let sessionStart = 0;
    let sensorStartDelta = 0;
    let sensorStopDelta = 0;
    let txmitterInSession = transmitterInSession(sgv);

    if (txmitterInSession) {
      // this is only true if we are the controlling rig AND the transmitter has an active session
      sessionStart = moment(sgv.sessionStartDate);

      // Give 6 minutes extra time
      sensorStartDelta = (sensorInsert && (sensorInsert.valueOf() - sessionStart.valueOf() - 6*60000)) || 0;

      sensorStopDelta = (sensorStop && (sensorStop.valueOf() - sessionStart.valueOf())) || 0;
    }

    if (txmitterInSession && (sensorStartDelta > 0 || sensorStopDelta > 0)) {
      // give a 2 hour play between the sensor insert record and the session start date from the transmitter
      console.log('Found sensor change, start, or stop after transmitter start date. Stopping Sensor Session.');
      console.log('Session Start: ' + sessionStart + ' sensorStart: ' + sensorInsert + ' sensorStop: ' + sensorStop);
      stopTransmitterSession();
      await stopSensorSession();
    } else {
      let haveCal = await calibration.haveCalibration(storage);

      let latestBgCheckTime = null;

      if (bgChecks.length > 0) {
        latestBgCheckTime = moment(bgChecks[bgChecks.length-1].dateMills);
      }

      let haveValidCal = await calibration.validateCalibration(storage, sensorInsert, sensorStop, latestBgCheckTime);

      if (haveCal && !haveValidCal) {
        console.log('Transmitter not in session and found sensor change, start, or stop after latest calibration and transmitter not in session. Stopping Sensor Session.');
        await stopSensorSession();
      }
    }
  };

  const startSession = async (startTime) => {
    let sgv = await getGlucose();

    if (!inSensorSession(sgv)) {
      // Only enter a sensorStart if we aren't
      // in either a transmitter session, extend session, or expired session
      await storage.setItem('sensorStart', Date.now())
        .catch(error => {
          console.log('Error getting rig sensorStart: ' + error);
        });
    }

    if (!transmitterInSession(sgv)) {
      let startPending = false;

      _.each(pending, (cmd) => {
        if (cmd.type == 'StartSensor') {
          startPending = true;
        }
      });

      if (!startPending) {
        pending.push({date: startTime, type: 'StartSensor'});

        client.newPending(pending);
      }
    }
  };

  const stopTransmitterSession = () => {
    // Stop sensor 3 hours prior to now to enable a rapid restart
    // if one is desired.
    pending.push({date: Date.now() - 3*60*60*1000, type: 'StopSensor'});

    client.newPending(pending);
  };

  const stopSensorSession = async () => {
    let now = moment();

    await storage.setItem('sensorStop', now.valueOf())
      .catch((err) => {
        console.log('Unable to store sensorStop: ' + err);
      });

    xDripAPS.postEvent('Sensor Stop', now);

    await storage.del('glucoseHist');
    await calibration.clearCalibration(storage);
  };

  const processNewGlucose = async (sgv) => {
    let glucoseHist = null;
    let sendSGV = true;

    let sensorInsert = await storage.getItem('sensorInsert')
      .catch(error => {
        console.log('Error getting rig sensorInsert: ' + error);
      });

    if (sensorInsert) {
      sensorInsert = moment(sensorInsert);
      console.log('SyncNS Rig sensor insert - date: ' + sensorInsert.format());
    }

    let sensorStart = await storage.getItem('sensorStart')
      .catch(error => {
        console.log('Error getting rig sensorStart: ' + error);
      });

    if (sensorStart) {
      sensorStart = moment(sensorStart);
      console.log('SyncNS Rig sensor start - date: ' + sensorStart.format());

      if (!sensorInsert || (sensorStart.valueOf() > sensorInsert.valueOf())) {
        // allow the user to enter either to reset the session.
        sensorInsert = sensorStart;
      }
    }

    let sensorStop = await storage.getItem('sensorStop')
      .catch(error => {
        console.log('Error getting rig sensorStop: ' + error);
      });

    if (sensorStop) {
      sensorStop = moment(sensorStop);
      console.log('SyncNS Rig sensor stop - date: ' + sensorStop.format());
    }

    await storageLock.lockStorage();

    sgv.readDateMills = moment(sgv.readDate).valueOf();

    let bgChecks = await storage.getItem('bgChecks')
      .catch(error => {
        console.log('Error getting bgChecks: ' + error);
      });

    if (!bgChecks) {
      bgChecks = [];
    }

    await checkSensorSession(sensorInsert, sensorStop, bgChecks, sgv);

    glucoseHist = await storage.getItem('glucoseHist')
      .catch((err) => {
        console.log('Error getting glucoseHist: ' + err);
      });

    if (!glucoseHist) {
      glucoseHist = [];
    }

    sgv = await calibration.calibrateGlucose(storage, options, sensorInsert, sensorStop, glucoseHist, sgv);

    if (sgv.inExtendedSession) {
      sgv.mode = 'extended cal';
    } else if (sgv.inExpiredSession) {
      sgv.mode = 'expired cal';
    } else {
      sgv.mode = 'txmitter cal';
    }

    sgv.stateString = stateString(sgv.state);
    sgv.stateStringShort = stateStringShort(sgv.state);

    sgv.txStatusString = txStatusString(sgv.status);
    sgv.txStatusStringShort = txStatusStringShort(sgv.status);

    if (glucoseHist.length > 0) {
      let prevSgv = await getGlucose();

      if (!prevSgv || (sgv.state != prevSgv.state)) {
        xDripAPS.postAnnouncement('Sensor: ' + sgv.stateString);
      }
    }

    console.log('sensor state: ' + sgv.stateString);

    if (!sgv.glucose || sgv.glucose < 20) {
      sgv.glucose = null;
      console.log('No valid glucose to send.');
      sendSGV = false;
    }

    await storeNewGlucose(glucoseHist, sgv)
      .catch(() => {
        console.log('Unable to store new glucose');
      });

    storageLock.unlockStorage();

    sendCGMStatus(sgv);

    sendNewGlucose(sgv, sendSGV);
  };

  const sendCGMStatus = async (sgv) => {

    let activeCal = await calibration.getActiveCal(options, storage);

    let activeCalTime = (activeCal && activeCal.dateMills) || null;

    xDripAPS.postStatus(txId, sgv, txStatus, activeCal, activeCalTime);
  };

  // Store the last 24 hours of glucose readings
  const storeNewGlucose = async (glucoseHist, sgv) => {

    glucoseHist.push(sgv);

    glucoseHist = _.sortBy(glucoseHist, ['readDateMills']);

    var minDate = moment().subtract(24, 'hours').valueOf();
    var sliceStart = 0;

    // store the last 24 hours of glucose
    // history is used to determine trend and noise values
    // and back fill nightscout.
    for (var i=0; i < glucoseHist.length; ++i) {
      if (glucoseHist[i].readDateMills < minDate) {
        sliceStart = i+1;
      }
    }

    glucoseHist = glucoseHist.slice(sliceStart);

    await storage.setItem('glucoseHist', glucoseHist)
      .catch((err) => {
        console.log('Unable to store glucoseHist: ' + err);
      });
  };

  const sendNewGlucose = async (sgv, sendSGV) => {
    client.newSGV(sgv);

    if (sgv.glucose) {
      // wait for fakeMeter to finish so it doesn't interfere with
      // pump-loop
      await fakeMeter.glucose(sgv.glucose);
    }

    xDripAPS.post(sgv, sendSGV);
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
      return state ? 'Unknown: 0x' + state.toString(16) : '--';
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
      return state ? 'Unknown: 0x' + state.toString(16) : '--';
    }
  };

  const stateString = (state) => {
    switch (state) {
    case 0x00:
      return 'None';
    case 0x01:
      return 'Stopped';
    case 0x02:
      return 'Warmup';
    case 0x03:
      return 'Unused';
    case 0x04:
      return 'First calibration';
    case 0x05:
      return 'Second calibration';
    case 0x06:
      return 'OK';
    case 0x07:
      return 'Need calibration';
    case 0x08:
      return 'Calibration Error 1';
    case 0x09:
      return 'Calibration Error 0';
    case 0x0a:
      return 'Calibration Linearity Fit Failure';
    case 0x0b:
      return 'Sensor Failed Due to Counts Aberration';
    case 0x0c:
      return 'Sensor Failed Due to Residual Aberration';
    case 0x0d:
      return 'Out of Calibration Due To Outlier';
    case 0x0e:
      return 'Outlier Calibration Request - Need a Calibration';
    case 0x0f:
      return 'Session Expired';
    case 0x10:
      return 'Session Failed Due To Unrecoverable Error';
    case 0x11:
      return 'Session Failed Due To Transmitter Error';
    case 0x12:
      return 'Temporary Session Failure - ???';
    case 0x13:
      return 'Reserved';
    case 0x80:
      return 'Calibration State - Start';
    case 0x81:
      return 'Calibration State - Start Up';
    case 0x82:
      return 'Calibration State - First of Two Calibrations Needed';
    case 0x83:
      return 'Calibration State - High Wedge Display With First BG';
    case 0x84:
      return 'Unused Calibration State - Low Wedge Display With First BG';
    case 0x85:
      return 'Calibration State - Second of Two Calibrations Needed';
    case 0x86:
      return 'Calibration State - In Calibration Transmitter';
    case 0x87:
      return 'Calibration State - In Calibration Display';
    case 0x88:
      return 'Calibration State - High Wedge Transmitter';
    case 0x89:
      return 'Calibration State - Low Wedge Transmitter';
    case 0x8a:
      return 'Calibration State - Linearity Fit Transmitter';
    case 0x8b:
      return 'Calibration State - Out of Cal Due to Outlier Transmitter';
    case 0x8c:
      return 'Calibration State - High Wedge Display';
    case 0x8d:
      return 'Calibration State - Low Wedge Display';
    case 0x8e:
      return 'Calibration State - Linearity Fit Display';
    case 0x8f:
      return 'Calibration State - Session Not in Progress';
    default:
      return state ? 'Unknown: 0x' + state.toString(16) : '--';
    }
  };

  const stateStringShort = (state) => {
    switch (state) {
    case 0x00:
      return 'None';
    case 0x01:
      return 'Stopped';
    case 0x02:
      return 'Warmup';
    case 0x03:
      return 'Unused';
    case 0x04:
      return '1st Cal';
    case 0x05:
      return '2nd Cal';
    case 0x06:
      return 'OK';
    case 0x07:
      return 'Need Cal';
    case 0x08:
      return 'Cal Err 1';
    case 0x09:
      return 'Cal Err 0';
    case 0x0a:
      return 'Cal Lin Fit';
    case 0x0b:
      return 'Fail Counts';
    case 0x0c:
      return 'Fail Resid';
    case 0x0d:
      return 'Outlier';
    case 0x0e:
      return 'Cal NOW';
    case 0x0f:
      return 'Expired';
    case 0x10:
      return 'Unrecoverable';
    case 0x11:
      return 'Failed Tx';
    case 0x12:
      return 'Temp Fail';
    case 0x13:
      return 'Reserved';
    case 0x80:
      return 'Cal - Start';
    case 0x81:
      return 'Cal - Start Up';
    case 0x82:
      return '1 of 2 Cal';
    case 0x83:
      return 'Hi Wedge Display';
    case 0x84:
      return 'Unused Cal';
    case 0x85:
      return '2 of 2 Cal';
    case 0x86:
      return 'In Cal Tx';
    case 0x87:
      return 'In Cal Display';
    case 0x88:
      return 'Hi Wedge Tx';
    case 0x89:
      return 'Lo Wedge Tx';
    case 0x8a:
      return 'Lin Fit Tx';
    case 0x8b:
      return 'Outlier Cal Tx';
    case 0x8c:
      return 'Hi Wedge Display';
    case 0x8d:
      return 'Lo Wedge Display';
    case 0x8e:
      return 'Lin Fit Display';
    case 0x8f:
      return 'No Session';
    default:
      return state ? 'Unknown: 0x' + state.toString(16) : '--';
    }
  };

  const processTxmitterCalData = async (calData) => {
    let bgChecks = null;
    let bgCheckIdx = -1;

    calData.dateMills = moment(calData.date).valueOf();

    console.log('Last calibration: ' + Math.round((Date.now() - calData.dateMills)/1000/60/60*10)/10 + ' hours ago');

    if (calData.glucose > 400 || calData.glucose < 20) {
      console.log('Txmitter Last Calibration Data glucose out of range - ignoring');
      return;
    }

    let rigSGVs = await storage.getItem('glucoseHist')
      .catch(error => {
        console.log('Error getting rig SGVs: ' + error);
      });

    if (!rigSGVs) {
      // we really shouldn't have gotten to this
      // state, but bail since we don't have any
      // glucose history to work with
      return;
    }

    let latestSGV = rigSGVs[rigSGVs.length-1];

    // check the sensor state
    // don't use this cal message data
    // if sensor state isn't OK or Need Calibration
    // In stopped state and maybe other states,
    // the last calibration data is not valid
    if ((latestSGV.state != 0x06) && (latestSGV.state != 0x07)) {
      return;
    }

    calData.type = 'Txmitter';

    await storageLock.lockStorage();

    bgChecks = await storage.getItem('bgChecks')
      .catch(error => {
        console.log('Error getting bgChecks: ' + error);
      });

    if (!bgChecks) {
      bgChecks = [];
    }

    // Look through the BG Checks we have to see if we already
    // have this BG Check
    for (let i = (bgChecks.length-1); i >= 0; --i) {
      if (Math.abs(bgChecks[i].dateMills - calData.dateMills) < 2*60*1000) {
        // The CGM transmitter report varies the time around
        // the real time a little between read events.
        // If they are within two minutes, assume it's the same
        // check and bail out.

        if (bgChecks[i].unfiltered) {
          // If it already has a unfiltered value
          // we have already completed processing
          // it.
          storageLock.unlockStorage();

          return;
        } else {
          // break out of the loop, but try to find
          // the unfiltered value
          bgCheckIdx = i;
        }
      }
    }

    let sensorInsert = await storage.getItem('sensorInsert')
      .catch(error => {
        console.log('Error getting rig sensorInsert: ' + error);
      });

    if (sensorInsert) {
      sensorInsert = moment(sensorInsert);
    }

    let valueTime = moment(calData.date);

    if (sensorInsert && (sensorInsert.diff(valueTime) > 0)) {
      // The calibration value pre-dates the NS sensorInsert record
      // Bail out.

      storageLock.unlockStorage();

      return;
    }

    calData.unfiltered = await calibration.getUnfiltered(storage, valueTime);

    if (bgCheckIdx >= 0) {
      // We already had this bgCheck but didn't have the unfiltered value
      bgChecks[bgCheckIdx].unfiltered = calData.unfiltered;
      bgChecks[bgCheckIdx].type = calData.type;
    } else {
      // This is a new bgCheck we didn't already have
      bgChecks.push(calData);

      bgChecks = _.sortBy(bgChecks, ['dateMills']);

      client.newCal(calData);
    }

    storage.setItem('bgChecks', bgChecks)
      .catch(error => {
        console.log('Error saving bgChecks: ' + error);
      });

    storageLock.unlockStorage();
  };

  const processBatteryStatus = (batteryStatus) => {
    txStatus = batteryStatus;

    txStatus.timestamp = moment();

    console.log('Got battery status message: ', txStatus);
  };

  const processBackfillData = async (backfillData) => {

    await storageLock.lockStorage();

    let glucoseHist = await storage.getItem('glucoseHist');
    let gaps = sgvGaps(glucoseHist);
    
    _.each(backfillData, (glucose) => {
      let sgvDate = moment(glucose.time);

      console.log('Received backfill glucose: ' + glucose.glucose + ' time: ' + sgvDate.format());

      if (glucose.type == 7) {
        _.each(gaps, (gap) => {
          glucose.readDateMills = moment(glucose.readDate).valueOf();
          if ((gap.gapStart.diff(sgvDate) < 0) && (gap.gapEnd.diff(sgvDate) > 0)) {
            console.log('Storing backfill glucose: ' + glucose.glucose + ' time: ' + sgvDate.format());
            glucoseHist.push({
              'readDateMills': sgvDate.valueOf()
              , 'glucose': glucose.glucose
              , 'readDate': sgvDate.format()
              , 'trend': 0
              , 'inSession': true
            });
          }
        });
      }
    });

    glucoseHist = _.sortBy(glucoseHist, ['readDateMills']);

    await storage.setItem('glucoseHist', glucoseHist)
      .catch((err) => {
        console.log('Unable to store glucoseHist: ' + err);
      });

    storageLock.unlockStorage();
  };

  // test to see if we have a BG Check that needs
  // to be entered into the pending messages
  // as a calibration.
  // Add it to pending if required.
  const calibrateFromNS = async () => {
    let latestBGCheckTime = null;
    let pendingCalTime = 0;

    let bgChecks = await storage.getItem('bgChecks')
      .catch(error => {
        console.log('Error getting bgChecks: ' + error);
      });

    if (!bgChecks) {
      bgChecks = [];
    }

    if (bgChecks.length > 0) {
      latestBGCheckTime = bgChecks[bgChecks.length-1].dateMills;
    }

    let latestTxmitterCal = await calibration.getLastCal(storage);
    let latestTxmitterCalTime = 0;

    if (latestTxmitterCal) {
      latestTxmitterCalTime = latestTxmitterCal.dateMills;
    }

    let deltaTime = latestBGCheckTime - latestTxmitterCalTime;
    let bgCheckAge = Date.now() - latestBGCheckTime;
    let timeSinceTxmitterControl = Date.now() - lastSuccessfulRead;

    let deltaFromLastCalSent = 5*60000; // initialize to a large value

    _.each(pending, (msg) => {
      if (msg.type === 'CalibrateSensor') {
        pendingCalTime = msg.date;
      }
    });

    if (lastSuccessfulTxmitterCalTime) {
      deltaFromLastCalSent = Math.abs(lastSuccessfulTxmitterCalTime - pendingCalTime);
    }

    // If the following things are true, then add a calibration record to pending
    //   There is not already a pending calibration
    //   We have a transmitter calibration time from the transmitter
    //   The time between the last BG Check and the last transmitter calibration time is more than 5 minutes
    //   The time since this rig last successfully connected and read the transmitter is less than 15 minutes
    //   The last successful calibration send to the transmitter is not the same as the last BG Check (prevents resending it on the next read)
    //   The BG Check occurred in the last 30 minutes
    if (!pendingCalTime && (deltaTime > 5*60000) && (bgCheckAge < 15*60000) && (timeSinceTxmitterControl < 15*60000) && latestTxmitterCalTime && (deltaFromLastCalSent > 2*60000)) {
      let glucose = bgChecks[bgChecks.length-1].glucose;
      console.log('Sending calibration value to transmitter: ' + glucose + ' at time: ' + moment(latestBGCheckTime).format());
      pending.push({date: latestBGCheckTime, type: 'CalibrateSensor', glucose});
      pendingCalTime = latestBGCheckTime;
    }

  };

  const listenToTransmitter = (id) => {
    if (!id) {
      console.log('Unable to listen to invalid Transmitter ID');
      return;
    }

    // Remove the BT device so it starts from scratch
    removeBTDevice(id);

    worker = cp.fork(__dirname + '/transmitter-worker', [id], {
      env: {
        DEBUG: 'transmitter,bluetooth-manager'
      }
    });

    worker.on('message', async m => {
      let pendingCalTime;

      if (m.msg == 'getMessages') {
        if (!txStatus || (moment().diff(txStatus.timestamp, 'minutes') > 25)) {
          pending.push({type: 'BatteryStatus'});
        }

        pendingCalTime = await calibrateFromNS(pendingCalTime);

        pending = pending.filter((msg) => {
          // Don't send certain messages older than 12 minutes
          if ((Date.now() - msg.date) > 12*60000) {
            return false;
          }

          return true;
        });

        let glucoseHist = await storage.getItem('glucoseHist');
        let gaps = sgvGaps(glucoseHist);

        let minGapDate = null;
        let maxGapDate = null;
        let now = moment();

        _.each(gaps, (gap) => {
          if ((now.diff(gap.gapStart, 'minutes') < 120) && (!minGapDate || (minGapDate.diff(gap.gapStart) < 0))) {
            minGapDate = gap.gapStart;
          }

          if (!maxGapDate || (maxGapDate.diff(gap.gapEnd) < 0)) {
            maxGapDate = gap.gapEnd;
          }
        });

        if ((minGapDate !== null) && glucoseHist && transmitterInSession(glucoseHist[glucoseHist.length-1])) {
          console.log('Requesting backfill - start: ' + minGapDate.format() + ' end: ' + maxGapDate.format());
          pending.push({ type: 'Backfill', date: minGapDate.valueOf(), endDate: maxGapDate.valueOf() });
        }

        worker.send(pending);
        // NOTE: this will lead to missed messages if the rig
        // shuts down before acting on them, or in the
        // event of lost comms
        // better to return something from the worker
        client.newPending(pending);
      } else if (m.msg == 'glucose') {
        const glucose = m.data;

        glucose.readDateMills = moment(glucose.readDate).valueOf();
        glucose.voltagea = txStatus && txStatus.voltagea || null;
        glucose.voltageb = txStatus && txStatus.voltageb || null;
        glucose.voltageTime = txStatus && txStatus.timestamp.valueOf() || null;

        console.log('got glucose: ' + glucose.glucose + ' unfiltered: ' + (glucose.unfiltered/1000));

        lastSuccessfulRead = glucose.readDateMills;
        // restart txFailedReads counter since we were successfull
        txFailedReads = 0;

        processNewGlucose(glucose);
      } else if (m.msg == 'messageProcessed') {
        // TODO: check that dates match

        if (pendingCalTime === m.date) {
          lastSuccessfulTxmitterCalTime = pendingCalTime;
        }

        pending.shift();
        client.newPending(pending);
      } else if (m.msg == 'calibrationData') {
        processTxmitterCalData(m.data);
      } else if (m.msg == 'batteryStatus') {
        processBatteryStatus(m.data);
      } else if (m.msg == 'sawTransmitter') {
        // increment failed reads counter so we know how many
        // times we saw the transmitter
        ++txFailedReads;
      } else if (m.msg == 'backfillData') {
        processBackfillData(m.data);
      }
    });

    /*eslint-disable no-unused-vars*/
    worker.on('exit', (m) => {
    /*eslint-enable no-unused-vars*/

      worker = null;

      // Receive results from child process
      console.log('exited');

      if (timerObj !==  null) {
        clearTimeout(timerObj);
      }

      if (id && id !== txId) {
        removeBTDevice(id);
      }

      if (txFailedReads >= 2) {
        // Automatically reboot on the 2nd failed read
        rebootRig();
      }

      timerObj = setTimeout(() => {
        // Restart the worker after 1 minute
        listenToTransmitter(txId);
      }, 1 * 60000);
    });

    timerObj = setTimeout(() => {
      // After 6 minutes, kill the worker if it hasn't already exited
      // When it exits after receiving kill signal, the on exit
      // callback will fire to restart it
      if (worker !== null) {
        try {
          console.log('Starting new worker, but one already exists. Attempting to kill it');
          worker.kill('SIGTERM');
        } catch (error) {
          console.log('Unable to kill existing worker: ' + error);
        }
      }
    }, 6 * 60000);
  };

  const getGlucose = async () => {
    let glucoseHist = await storage.getItem('glucoseHist');

    if (glucoseHist) {
      return glucoseHist[glucoseHist.length-1];
    } else {
      return null;
    }
  };

  const transmitterInSession = (sgv) => {
    if (sgv && ('inSession' in sgv) && sgv.inSession) {
      return true;
    } else {
      return false;
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

  const sgvGaps = (rigSGVs) => {
    let now = moment().valueOf();
    let minDate = moment().subtract(24, 'hours').valueOf();

    let rigGaps = [ ];

    if (rigSGVs && (rigSGVs.length > 0)) {
      let prevTime = rigSGVs[0].readDateMills;

      for (let i = 1; i < rigSGVs.length; ++i) {
        // Add 1 minute to gapStart and subtract 1 minute from gapEnd to prevent duplicats
        let gap = { gapStart: moment(prevTime+60000), gapEnd: moment(rigSGVs[i].readDateMills-60000) };
        if ((rigSGVs[i].readDateMills - prevTime) > 6*60000) {
          rigGaps.push(gap);
        }

        prevTime = rigSGVs[i].readDateMills;
      }

      if ((now - prevTime) > 6*60000) {
        // Add 1 minute to gapStart to prevent duplicats
        rigGaps.push( { gapStart: moment(prevTime+60000), gapEnd: moment(now) } );
      }
    } else {
      // Add 1 minute to gapStart to prevent duplicats
      rigGaps.push( { gapStart: moment(minDate+60000), gapEnd: moment(now) } );
    }

    return rigGaps;
  };

  // Create an object that can be used
  // to interact with the transmitter.
  const transmitterIO = {
    // provide the current transmitter ID
    getTxId: () => {
      return txId;
    },

    // provide the pending list
    getPending: () => {
      return pending;
    },

    // provide the most recent glucose reading
    getGlucose: async () => {
      return getGlucose();
    },

    // provide the glucose history
    getHistory: async () => {
      let glucoseHist = await storage.getItem('glucoseHist')
        .catch(error => {
          console.log('Unable to get glucoseHist storage item: ' + error);
        });

      if (!glucoseHist) {
        glucoseHist = [];
      }

      return glucoseHist.map((sgv) => {
        return { readDate: sgv.readDateMills, glucose: sgv.glucose };
      });
    },

    // provide the most recent Txmitter calibration
    getLastCal: async () => {
      return calibration.getLastCal(storage);
    },

    // Reset the transmitter
    resetTx: () => {
      pending.push({date: Date.now(), type: 'ResetTx'});

      client.newPending(pending);
    },

    // Start a sensor session
    startSensor: () => {
      startSession(Date.now());
    },

    // Start a sensor session at time
    startSensorTime: (startTime) => {
      startSession(startTime.valueOf());
    },

    // Start a sensor session back started 2 hours
    backStartSensor: () => {
      startSession(Date.now() - 2*60*60*1000);
    },

    stopSensor: async () => {
      await stopSensorSession();

      let sgv = await getGlucose();

      if (transmitterInSession(sgv)) {
        stopTransmitterSession();
      }
    },

    sendBgCheckToTxmitter: (bgCheck) => {
      pending.push({date: bgCheck.dateMills, type: 'CalibrateSensor', glucose: bgCheck.glucose});

      client.newPending(pending);
    },

    // calibrate the sensor
    calibrate: async (glucose) => {
      let timeValue = moment();

      await storageLock.lockStorage();

      let bgChecks = await storage.getItem('bgChecks')
        .catch(error => {
          console.log('Error getting bgChecks: ' + error);
        });

      if (!bgChecks) {
        bgChecks = [];
      }

      let calData = {
        'date': timeValue.format(),
        'dateMills': timeValue.valueOf(),
        'glucose': glucose,
        'type': 'GUI'
      };

      bgChecks.push(calData);

      bgChecks = _.sortBy(bgChecks, ['dateMills']);

      storage.setItem('bgChecks', bgChecks)
        .catch(error => {
          console.log('Error saving bgChecks: ' + error);
        });

      storageLock.unlockStorage();

      pending.push({date: Date.now(), type: 'CalibrateSensor', glucose});

      xDripAPS.postBGCheck(calData);

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
      let sgv = getGlucose();

      return inSensorSession(sgv);
    },

    sgvGaps: (rigSGVs) => {
      return sgvGaps(rigSGVs);
    }
  };

  // Provide the object to the client
  client.setTransmitter(transmitterIO);

  // Read the current stored transmitter value
  txId = await storage.getItem('id');

  // Start the transmitter loop task
  listenToTransmitter(txId);

  return transmitterIO;
};
