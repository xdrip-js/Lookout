const xDripAPS = require('./xDripAPS')();
const calibration = require('./calibration');
const storage = require('node-persist');
const cp = require('child_process');
const moment = require('moment');
const storageLock = require('./storageLock');
const syncNS = require('./syncNS');
const stats = require('./calcStats');

var _ = require('lodash');

module.exports = async (io, extend_sensor_opt) => {
  let txId;
  let pending = [];
  let extend_sensor = extend_sensor_opt;
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

  const getLastG5Cal = (bgChecks) => {
    let lastG5Cal = null;

    if (bgChecks) {
      for (let ii=(bgChecks.length-1); ii >= 0; --ii) {
        if (bgChecks[ii].type == 'G5') {
          lastG5Cal = bgChecks[ii];
          break;
        }
      }
    }

    return lastG5Cal;
  };

  const processNewGlucose = async (sgv) => {
    let lastCal = null;
    let glucoseHist = null;
    let sensorInsert = null;
    let sendSGV = true;

    // Check if a new sensor has been inserted.
    // If it has been, it will clear the calibration value
    // and abort sending the SGV if we are applying Lookout
    // calibration instead of G5 calibration
    sensorInsert = await xDripAPS.latestSensorInserted()
      .catch(error => {
        console.log('Unable to get latest sensor inserted record from NS: ' + error);
      });

    await storageLock.lockStorage();

    sgv.g5calibrated = true;
    sgv.stateString = stateString(sgv.state);

    console.log('sensor state: ' + sgv.stateString);

    if (sgv.unfiltered > 10000) {
      sgv.unfiltered = sgv.unfiltered / 1000.0;
      sgv.filtered = sgv.filtered / 1000.0;
    }

    lastCal = await storage.getItem('g5Calibration')
      .catch(error => {
        console.log('Unable to obtain current NS Calibration' + error);
      });

    glucoseHist = await storage.getItem('glucoseHist')
      .catch((err) => {
        console.log('Error getting glucoseHist: ' + err);
      });

    let bgChecks = await storage.getItem('bgChecks')
      .catch((err) => {
        console.log('Error getting bgChecks: ' + err);
      });

    let lastG5CalTime = 0;
    let newCal = null;

    let lastG5Cal = getLastG5Cal(bgChecks);

    if (lastG5Cal) {
      lastG5CalTime = lastG5Cal.date;
    }

    if (!glucoseHist) {
      glucoseHist = [];
    }

    if (glucoseHist.length > 0) {
      newCal = calibration.calculateG5Calibration(lastCal, lastG5CalTime, glucoseHist, sgv);

      if (sgv.state != glucoseHist[glucoseHist.length-1].state) {
        xDripAPS.postAnnouncement('Sensor: ' + sgv.stateString);
      }
    }

    if (newCal) {
      lastCal = newCal;
    }

    if (!sgv.glucose && extend_sensor && lastCal && (lastCal.type !== 'Unity')) {
      sgv.glucose = calibration.calcGlucose(sgv, lastCal);

      console.log('Invalid glucose value received from transmitter, replacing with calibrated unfiltered value');
      console.log('Calibrated SGV: ' + sgv.glucose + ' unfiltered: ' + sgv.unfiltered + ' slope: ' + lastCal.slope + ' intercept: ' + lastCal.intercept);

      sgv.g5calibrated = false;
    }

    if (sensorInsert && (sensorInsert.diff(moment(lastCal.date).subtract(6, 'minutes')) > 0)) {
      console.log('Found sensor insert after latest calibration. Deleting calibration data.');
      await storage.del('g5Calibration');
      await storage.del('bgChecks');
      await storage.del('glucoseHist');

      newCal = {
        date: Date.now(),
        scale: 1,
        intercept: 0,
        slope: 1,
        type: 'Unity'
      };       

      // set the glucose value to null
      // so it doesn't show up in the Lookout GUI
      sgv.glucose = null;
      sendSGV = false;
    }

    if (newCal) {
      console.log('New calibration: slope = ' + newCal.slope + ', intercept = ' + newCal.intercept + ', scale = ' + newCal.scale);

      await storage.setItem('g5Calibration', newCal)
        .catch(() => {
          console.log('Unable to store new NS Calibration');
        });

      xDripAPS.postCalibration(newCal);
    }


    if (!sgv.glucose || sgv.glucose < 20) {
      sgv.glucose = null;
      console.log('No valid glucose to send.');
      sendSGV = false;
    }

    // Store it regardless for state change history
    glucoseHist.push(sgv);

    if (lastCal) {
      // a valid calibration is available to use
      sgv.trend = stats.calcTrend(glucoseHist, lastCal);

      sgv.noise = stats.calcSensorNoise(glucoseHist, lastCal);
    } else {
      // No way to calculate a trend since we don't know the calibration slope
      sgv.trend = 0;

      // Put in light noise to account for uncertainty
      sgv.noise = .4;
    }

    sgv.nsNoise = stats.calcNSNoise(sgv.noise, glucoseHist);

    console.log('Current sensor trend: ' + Math.round(sgv.trend*10)/10 + ' Sensor Noise: ' + Math.round(sgv.noise*1000)/1000 + ' NS Noise: ' + sgv.nsNoise);

    await storeNewGlucose(glucoseHist)
      .catch(() => {
        console.log('Unable to store new glucose');
      });

    storageLock.unlockStorage();

    sendNewGlucose(sgv, sendSGV);
  };

  // Store the last hour of glucose readings
  const storeNewGlucose = async (glucoseHist) => {

    glucoseHist = _.sortBy(glucoseHist, ['readDate']);

    var minDate = moment().subtract(24, 'hours');
    var sliceStart = 0;

    // store the last 24 hours of glucose
    // history is used to determine trend and noise values
    // and back fill nightscout.
    for (var i=0; i < glucoseHist.length; ++i) {
      if (moment(glucoseHist[i].readDate).diff(minDate) < 0) {
        sliceStart = i+1;
      }
    }

    glucoseHist = glucoseHist.slice(sliceStart);

    await storage.setItem('glucoseHist', glucoseHist)
      .catch((err) => {
        console.log('Unable to store glucoseHist: ' + err);
      });
  };

  const sendNewGlucose = (sgv, sendSGV) => {
    io.emit('glucose', sgv);

    if (!sgv.glucose) {
      // Set to 5 so NS will plot the unfiltered glucose values
      sgv.glucose = 5;
    }

    xDripAPS.post(sgv, sendSGV);
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

  const processG5CalData = async (calData) => {
    let rigSGVs = null;
    let matchingSGV = null;
    let bgChecks = null;

    console.log('Last calibration: ' + Math.round((Date.now() - calData.date)/1000/60/60*10)/10 + ' hours ago');

    if (calData.glucose > 400 || calData.glucose < 20) {
      console.log('G5 Last Calibration Data glucose out of range - ignoring');
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

    for (let i = (bgChecks.length-1); i >= 0; --i) {
      if (Math.abs(bgChecks[i].date - calData.date) < 2*60*1000) {
        // The G5 transmitter report varies the time around
        // the real time a little between read events.
        // If they are within two minutes, assume it's the same
        // check and bail out.

        storageLock.unlockStorage();

        return;
      }
    }

    rigSGVs = await storage.getItem('glucoseHist')
      .catch(error => {
        console.log('Error getting rig SGVs: ' + error);
      });

    calData.unfiltered = 0;

    if (rigSGVs && (rigSGVs.length > 0)) {
      // check the sensor state
      // don't use this cal message data
      // if sensor state isn't OK
      // In stopped state and maybe other states,
      // the last calibration data is not valid
      let latestSGV = rigSGVs[rigSGVs.length-1];

      if (latestSGV.state != 0x06) {
        console.log('Sensor state not "OK" - not using latest calibration message data.');
        storageLock.unlockStorage();
        return;
      }

      // we can assume they are already sorted
      // since we sort before storing them

      matchingSGV = _.find(rigSGVs, (o) => {
        return o.readDate > calData.date;
      });

      if (matchingSGV) {
        console.log('Matching SGV Unfiltered: ' + matchingSGV.unfiltered);
        console.log('Matching Cal SGV: ' + calData.glucose);

        calData.unfiltered = matchingSGV.unfiltered;
      }
    }

    bgChecks.push(calData);

    bgChecks = _.sortBy(bgChecks, ['date']);

    storage.setItem('bgChecks', bgChecks)
      .catch(error => {
        console.log('Error saving bgChecks: ' + error);
      });

    storageLock.unlockStorage();

    xDripAPS.postBGCheck(calData);

    io.emit('calibrationData', calData);
  };

  const listenToTransmitter = (id) => {
    // Remove the BT device so it starts from scratch
    removeBTDevice(id);

    worker = cp.fork(__dirname + '/transmitter-worker', [id], {
      env: {
        DEBUG: 'transmitter,bluetooth-manager'
      }
    });

    worker.on('message', m => {
      if (m.msg == 'getMessages') {
        worker.send(pending);
        // NOTE: this will lead to missed messages if the rig
        // shuts down before acting on them, or in the
        // event of lost comms
        // better to return something from the worker
        io.emit('pending', pending);
      } else if (m.msg == 'glucose') {
        const glucose = m.data;
        console.log('got glucose: ' + glucose.glucose + ' unfiltered: ' + glucose.unfiltered);

        processNewGlucose(glucose);
      } else if (m.msg == 'messageProcessed') {
        // TODO: check that dates match
        pending.shift();
        io.emit('pending', pending);
      } else if (m.msg == 'calibrationData') {
        processG5CalData(m.data);
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

      if (id !== txId) {
        removeBTDevice(id);
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

  // handle persistence here
  // make the storage direction relative to the install directory,
  // not the calling directory
  await storage.init({dir: __dirname + '/storage'});

  let value = await storage.getItem('id');

  txId = value || '500000';

  syncNS();

  listenToTransmitter(txId);

  io.on('connection', async socket => {
    // TODO: should this just be a 'data' message?
    // how do we initialise the connection with
    // all the data it needs?

    console.log('about to emit id ' + txId);
    socket.emit('id', txId);
    socket.emit('pending', pending);

    let glucoseHist = await storage.getItem('glucoseHist')
      .catch(error => {
        console.log('Unable to get glucoseHist storage item: ' + error);
      });

    if (glucoseHist) {
      socket.emit('glucose', glucoseHist[glucoseHist.length - 1]);
    }

    let bgChecks = await storage.getItem('bgChecks')
      .catch(error => {
        console.log('Unable to get bgChecks storage item: ' + error);
      });

    let lastG5Cal = getLastG5Cal(bgChecks);

    if (lastG5Cal) {
      socket.emit('calibrationData', lastG5Cal);
    }

    socket.on('resetTx', () => {
      console.log('received resetTx command');
      pending.push({date: Date.now(), type: 'ResetTx'});
      io.emit('pending', pending);
    });
    socket.on('startSensor', () => {
      console.log('received startSensor command');
      pending.push({date: Date.now(), type: 'StartSensor'});
      io.emit('pending', pending);
    });
    socket.on('stopSensor', () => {
      console.log('received stopSensor command');
      pending.push({date: Date.now(), type: 'StopSensor'});
      io.emit('pending', pending);
    });
    socket.on('calibration', glucose => {
      console.log('received calibration of ' + glucose);
      pending.push({date: Date.now(), type: 'CalibrateSensor', glucose});
      io.emit('pending', pending);
    });
    socket.on('id', value => {
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
        }

        console.log('received id of ' + value);
        txId = value;

        storage.del('g5Calibration');
        storage.del('bgChecks');
        storage.del('glucoseHist');

        storage.setItemSync('id', txId);
        // TODO: clear glucose on new id
        // use io.emit rather than socket.emit
        // since we want to notify all connections
        io.emit('id', txId);
      }
    });
  });

};
