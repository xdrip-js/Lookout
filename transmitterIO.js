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

    cp.exec('shutdown -r now', (err, stdout, stderr) => {
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
  // the latest sensor insert record.
  const checkSensorSession = (sensorInsert, sgv) => {
    if (sgv.inSession && ((sensorInsert.valueOf() - (moment(sgv.sessionStartDate).valueOf() + 2*60*60000)) > 0)) {
      // give a 2 hour play between the sensor insert record and the session start date from the transmitter
      console.log('Found sensor insert after transmitter start date. Stopping Sensor Session.');
      stopTransmitterSession();
      stopSensorSession();
    } else if (calibration.haveCalibration(storage) && !calibration.validateCalibration(storage, sensorInsert)) {
      console.log('Transmitter not in session and found sensor insert after latest calibration and transmitter not in session. Stopping Sensor Session.');
      stopSensorSession();
    }
  };

  const startTransmitterSession = () => {
    pending.push({date: Date.now(), type: 'StartSensor'});

    client.newPending(pending);
  };

  const stopTransmitterSession = () => {
    // Stop sensor 3 hours prior to now to enable a rapid restart
    // if one is desired.
    pending.push({date: Date.now() - 3*60*60*1000, type: 'StopSensor'});

    client.newPending(pending);
  };

  const stopSensorSession = async (storage) => {
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

    await storageLock.lockStorage();

    sgv.readDateMills = moment(sgv.readDate).valueOf();

    checkSensorSession(sensorInsert, sgv, calibration.getTxmitterCal(), calibration.getExpiredCal());

    glucoseHist = await storage.getItem('glucoseHist')
      .catch((err) => {
        console.log('Error getting glucoseHist: ' + err);
      });

    if (!glucoseHist) {
      glucoseHist = [];
    }

    sgv = calibration.calibrateGlucose(storage, options, sensorInsert, glucoseHist, sgv);

    sgv.stateString = stateString(sgv.state);
    sgv.stateStringShort = stateStringShort(sgv.state);

    console.log('sensor state: ' + sgv.stateString);

    sgv.txStatusString = txStatusString(sgv.status);
    sgv.txStatusStringShort = txStatusStringShort(sgv.status);

    if (!sgv.glucose || sgv.glucose < 20) {
      sgv.glucose = null;
      console.log('No valid glucose to send.');
      sendSGV = false;
    }

    // Store it regardless for state change history
    glucoseHist.push(sgv);

    await storeNewGlucose(glucoseHist)
      .catch(() => {
        console.log('Unable to store new glucose');
      });

    storageLock.unlockStorage();

    sendCGMStatus(sgv);

    sendNewGlucose(sgv, sendSGV);
  };

  const sendCGMStatus = async (sgv) => {

    let activeCal = calibration.getActiveCal(storage);

    let activeCalTime = (activeCal && activeCal.dateMills) || null;

    xDripAPS.postStatus(txId, sgv, txStatus, activeCal, activeCalTime);
  };

  // Store the last hour of glucose readings
  const storeNewGlucose = async (glucoseHist) => {

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

    if (!sgv.glucose) {
      // Set to 5 so NS will plot the unfiltered glucose values
      sgv.glucose = 5;
    } else {
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

  const processG5CalData = async (calData) => {
    let bgChecks = null;
    let bgCheckIdx = -1;

    calData.dateMills = moment(calData.date).valueOf();

    console.log('Last calibration: ' + Math.round((Date.now() - calData.dateMills)/1000/60/60*10)/10 + ' hours ago');

    if (calData.glucose > 400 || calData.glucose < 20) {
      console.log('G5 Last Calibration Data glucose out of range - ignoring');
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

    calData.type = 'G5';

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
        // The G5 transmitter report varies the time around
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
    }

    storage.setItem('bgChecks', bgChecks)
      .catch(error => {
        console.log('Error saving bgChecks: ' + error);
      });

    await calibration.expiredCalibration(storage, bgChecks, null, sensorInsert, null);

    storageLock.unlockStorage();

    client.newCal(calData);
  };

  const processBatteryStatus = (batteryStatus) => {
    txStatus = batteryStatus;

    txStatus.timestamp = moment();

    console.log('Got battery status message: ', txStatus);
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

    worker.on('message', m => {
      if (m.msg == 'getMessages') {
        if (!txStatus || (moment().diff(txStatus.timestamp, 'minutes') > 25)) {
          pending.push({type: 'BatteryStatus'});
        }

        pending = pending.filter((msg) => {
          // Don't send the transmitter calibration events older than 12 minutes
          if ((msg.type == 'CalibrateSensor') && ((Date.now() - msg.date) > 12*60000)) {
            return false;
          }

          return true;
        });

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

        // restart txFailedReads counter since we were successfull
        txFailedReads = 0;

        processNewGlucose(glucose);
      } else if (m.msg == 'messageProcessed') {
        // TODO: check that dates match
        pending.shift();
        client.newPending(pending);
      } else if (m.msg == 'calibrationData') {
        processG5CalData(m.data);
      } else if (m.msg == 'batteryStatus') {
        processBatteryStatus(m.data);
      } else if (m.msg == 'sawTransmitter') {
        // increment failed reads counter so we know how many
        // times we saw the transmitter
        ++txFailedReads;
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
      let glucoseHist = await storage.getItem('glucoseHist');

      if (glucoseHist) {
        return glucoseHist[glucoseHist.length-1];
      } else {
        return null;
      }
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

    // provide the most recent G5 calibration
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
      startTransmitterSession();
    },

    // Start a sensor session back started 2 hours
    backStartSensor: () => {
      pending.push({date: Date.now() - 2*60*60*1000, type: 'StartSensor'});

      client.newPending(pending);
    },

    stopSensor: () => {
      stopTransmitterSession();
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

    stopSensorSession: () => {
      stopSensorSession();
    },

    inSensorSession: (sgv) => {

      if (sgv.inSession) {
        return true;
      }

      // If the transmitter is not in a session, return whether
      // we have a valid set of calibration values
      return calibration.haveCalibration(storage);
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
