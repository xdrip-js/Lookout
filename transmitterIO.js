const xDripAPS = require('./xDripAPS')();
const calibration = require('./calibration');
const storage = require('node-persist');
const cp = require('child_process');
const moment = require('moment');
var _ = require('lodash');

module.exports = async (io, extend_sensor_opt) => {
  let id;
  let pending = [];
  let extend_sensor = extend_sensor_opt;
  let worker = null;
  let timerObj = null;
  let SGVStorageLocked = false;

  const timeout = async (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  };

  const lockSGVStorage = async () => {
    // sleep for 1 second at a time until
    // the storage is unlocked
    while (SGVStorageLocked) {
      console.log('Storage locked... waiting 1 second');
      await timeout(1000);
    }

    console.log('Storage locked.');
    SGVStorageLocked = true;
  };

  const unlockSGVStorage = () => {
    console.log('Storage unlocked.');
    SGVStorageLocked = false;
  };

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

  const calculateNewNSCalibration = (lastCal, lastG5CalTime, glucoseHist, currSGV) => {
    // set it to a high number so we upload a new cal
    // if we don't have a previous calibration

    // Do not calculate a new calibration value
    // if we don't have a valid calibrated glucose reading
    if (currSGV.glucose > 300 || currSGV.glucose < 80) {
      console.log('Current glucose out of range to calibrate: ' + currSGV.glucose);
      return null;
    }

    var calErr = 100;
    var calValue;
    var i;

    if (lastCal) {
      calValue = (currSGV.unfiltered-lastCal.intercept)/lastCal.slope;
      calErr = calValue - currSGV.glucose;

      console.log('Current calibration error: ' + Math.round(calErr*10)/10 + ' calibrated value: ' + Math.round(calValue*10)/10 + ' slope: ' + Math.round(lastCal.slope*10)/10 + ' intercept: ' + Math.round(lastCal.intercept*10)/10);
    }

    // Check if we need a calibration
    if (!lastCal || (Math.abs(calErr) > 5)) {
      var calPairs = [];

      calPairs.push(currSGV);

      // Suitable values need to be:
      //   less than 300 mg/dl
      //   greater than 80 mg/dl
      //   calibrated via G5, not Lookout
      //   12 minutes after the last G5 calibration time (it takes up to 2 readings to reflect calibration updates)
      for (i=0; ((i < glucoseHist.length) && (calPairs.length < 10)); ++i) {
        // Only use up to 10 of the most recent suitable readings
        let sgv = glucoseHist[glucoseHist.length-i-1];
  
        if ((sgv.readDate > (lastG5CalTime + 12*60*1000)) && (sgv.glucose < 300) && (sgv.glucose > 80) && sgv.g5calibrated) {
          calPairs.push(sgv);
        }
      }

      // If we have at least 3 good pairs, use LSR
      if (calPairs.length > 3) {
        let calResult = calibration.lsrCalibration(calPairs);

        if ((calResult.slope > 12.5) || (calResult.slope < 0.45)) {
          // wait until the next opportunity
          console.log('Slope out of range to calibrate: ' + calResult.slope);
          return null;
        }

        console.log('Calibrated with LSR');

        return {
          date: Date.now(),
          scale: 1,
          intercept: calResult.yIntercept,
          slope: calResult.slope,
          type: calResult.calibrationType
        };
      } else if (calPairs.length > 0) {
        let calResult = calibration.singlePointCalibration(calPairs);

        console.log('Calibrated with Single Point');

        return {
          date: Date.now(),
          scale: 1,
          intercept: calResult.yIntercept,
          slope: calResult.slope,
          type: calResult.calibrationType
        };
      } else {
        console.log('Calibration needed, but no suitable glucose pairs found.');
        return null;
      }
    } else {
      console.log('No calibration update needed.');
      return null;
    }
  };

  // Calculate the sum of the distance of all points (overallDistance)
  // Calculate the overall distance between the first and the last point (overallDistance)
  // Calculate the noise as the following formula: 1 - sod / overallDistance
  // Noise will get closer to zero as the sum of the individual lines are mostly in a straight or straight moving curve
  // Noise will get closer to one as the sum of the distance of the individual lines get large
  // Also add multiplier to get more weight to the latest BG values
  // Also added weight for points where the delta shifts from pos to neg or neg to pos (peaks/valleys)
  // the more peaks and valleys, the more noise is amplified
  const calcSensorNoise = (glucoseHist) => {
    const MAXRECORDS=8;
    const MINRECORDS=4;
    var noise = 0;

    var sgvArr = glucoseHist.slice(-MAXRECORDS);

    let n=sgvArr.length;

    let firstSGV = sgvArr[0].glucose * 1000.0;
    let firstTime = sgvArr[0].readDate / 1000.0 * 30.0;

    let lastSGV = sgvArr[n-1].glucose * 1000.0;
    let lastTime = sgvArr[n-1].readDate / 1000.0 * 30.0;

    let xarr = [];

    for (let i=0; i < n; i++) {
      xarr.push(sgvArr[i].readDate / 1000.0 * 30.0 - firstTime);
    }

    // sod = sum of distances
    var sod=0;
    var lastDelta=0;

    for (let i=1; i < n; i++) {
      // y2y1Delta adds a multiplier that gives 
      // higher priority to the latest BG's
      let y2y1Delta=(sgvArr[i].glucose - sgvArr[i-1].glucose) * 1000.0 * (1 + i / (n*3));

      let x2x1Delta=xarr[i] - xarr[i-1];

      if ((lastDelta > 0) && (y2y1Delta < 0)) {
        // switched from positive delta to negative, increase noise impact  
        y2y1Delta=y2y1Delta * 1.1;
      }
      else if ((lastDelta < 0) && (y2y1Delta > 0)) {
        // switched from negative delta to positive, increase noise impact 
        y2y1Delta=y2y1Delta * 1.2;
      }

      sod=sod + Math.sqrt(Math.pow(x2x1Delta, 2) + Math.pow(y2y1Delta, 2));
    }

    var overallsod=Math.sqrt(Math.pow(lastSGV - firstSGV, 2) + Math.pow(lastTime - firstTime, 2));

    if ((n < MINRECORDS) || (sod === 0)) {
      // assume no noise if no records
      noise = 0;
    } else {
      noise=1 - (overallsod/sod);
    }

    return noise;
  };

  // Return 10 minute trend total
  const calcTrend = (glucoseHist) => {
    let sgvHist = null;

    let trend = 0;


    if (glucoseHist.length > 1) {
      let minDate = moment().subtract(16, 'minutes');
      let maxDate = null;
      let sliceStart = 0;
      let timeSpan = 0;
      let totalDelta = 0;

      // delete any deltas > 16 minutes
      for (var i=0; i < glucoseHist.length; ++i) {
        if (moment(glucoseHist[i].readDate).diff(minDate) < 0) {
          sliceStart = i+1;
        }
      }

      sgvHist = glucoseHist.slice(sliceStart);

      if (sgvHist.length > 1) {
        minDate = sgvHist[0].readDate;
        maxDate = sgvHist[sgvHist.length-1].readDate;

        totalDelta = sgvHist[sgvHist.length-1].glucose - sgvHist[0].glucose;

        timeSpan = (maxDate - minDate)/1000.0/60.0;

        trend=10 * totalDelta / timeSpan;
      }
    } else {
      console.log('Not enough history for trend calculation: ' + glucoseHist.length);
    }

    return trend;
  };

  // Return sensor noise
  const calcNSNoise = (noise, glucoseHist) => {
    let nsNoise = 0; // Unknown
    let currSGV = glucoseHist[glucoseHist.length-1];
    let deltaSGV = 0;

    if (glucoseHist.length > 1) {
      deltaSGV = currSGV.glucose - glucoseHist[glucoseHist.length-2].glucose;
    }

    if (currSGV.glucose > 400) {
      console.log('Glucose ' + currSGV.glucose + ' > 400 - setting noise level Heavy');
      nsNoise = 4;
    } else if (currSGV.glucose < 40) {
      console.log('Glucose ' + currSGV.glucose + ' < 40 - setting noise level Light');
      nsNoise = 2;
    } else if (Math.abs(deltaSGV) > 30) {
      console.log('Glucose change ' + deltaSGV + ' out of range [-30, 30] - setting noise level Heavy');
      nsNoise = 4;
    } else if (noise < 0.35) {
      nsNoise = 1; // Clean
    } else if (noise < 0.5) {
      nsNoise = 2; // Light
    } else if (noise < 0.7) {
      nsNoise = 3; // Medium
    } else if (noise >= 0.7) {
      nsNoise = 4; // Heavy
    }

    return nsNoise;
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

    await lockSGVStorage();

    sgv.g5calibrated = true;
    sgv.stateString = stateString(sgv.state);

    console.log('sensor state: ' + sgv.stateString);

    lastCal = await storage.getItem('nsCalibration')
      .catch(error => {
        console.log('Unable to obtain current NS Calibration' + error);
      });

    glucoseHist = await storage.getItem('glucoseHist')
      .catch((err) => {
        console.log('Error getting glucoseHist: ' + err);
      });

    let storedLastG5CalData = await storage.getItem('calibration')
      .catch((err) => {
        console.log('Error getting lastG5CalData: ' + err);
      });

    let lastG5CalTime = 0;
    let newCal = null;

    if (storedLastG5CalData) {
      lastG5CalTime = storedLastG5CalData.date;
    }

    if (!glucoseHist) {
      glucoseHist = [];
    }

    if (glucoseHist.length > 0) {
      newCal = calculateNewNSCalibration(lastCal, lastG5CalTime, glucoseHist, sgv);
    }

    if (newCal) {
      lastCal = newCal;

      console.log('New calibration: slope = ' + newCal.slope + ', intercept = ' + newCal.intercept + ', scale = ' + newCal.scale);

      storage.setItem('nsCalibration', newCal)
        .catch(() => {
          console.log('Unable to store new NS Calibration');
        });

      xDripAPS.postCalibration(newCal);
    }

    if (!sgv.glucose && extend_sensor && lastCal) {
      sgv.glucose = Math.round((sgv.unfiltered-lastCal.intercept)/lastCal.slope);

      console.log('Invalid glucose value received from transmitter, replacing with calibrated unfiltered value');
      console.log('Calibrated SGV: ' + sgv.glucose + ' unfiltered: ' + sgv.unfiltered + ' slope: ' + lastCal.slope + ' intercept: ' + lastCal.intercept);

      sgv.g5calibrated = false;

      if (sensorInsert && (sensorInsert.diff(moment(lastCal.date)) > 0)) {
        console.log('Found sensor insert after latest calibration. Deleting calibration data.');
        storage.del('nsCalibration');
        storage.del('calibration');
        storage.del('glucoseHist');

        // set the glucose value to null
        // so it doesn't show up in the Lookout GUI
        sgv.glucose = null;
        sendSGV = false;
      }
    }

    if (!sgv.glucose) {
      console.log('No valid glucose to send.');
      sendSGV = false;
    }

    if (sendSGV) {
      // a valid SGV value is ready to store and send
      glucoseHist.push(sgv);

      sgv.trend = calcTrend(glucoseHist);

      sgv.noise = calcSensorNoise(glucoseHist);

      sgv.nsNoise = calcNSNoise(sgv.noise, glucoseHist);

      console.log('Current sensor trend: ' + Math.round(sgv.trend*10)/10 + ' Sensor Noise: ' + Math.round(sgv.noise*1000)/1000 + ' NS Noise: ' + sgv.nsNoise);

    }

    await storeNewGlucose(glucoseHist);

    unlockSGVStorage();

    sendNewGlucose(sgv, sendSGV, glucoseHist);
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

  const sendNewGlucose = (sgv, sendSGV, glucoseHist) => {
    io.emit('glucose', sgv);

    if (sendSGV) {
      xDripAPS.post(glucoseHist);
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

  const syncNSCal = async (sensorInsert) => {
    let rigCal = null;
    let NSCal = null;

    NSCal = await xDripAPS.latestCal()
      .catch(error => {
        console.log('Error getting NS calibration: ' + error);
        return;
      });

    console.log('SyncNS NS Cal:');
    console.log(NSCal);

    await lockSGVStorage();

    rigCal = await storage.getItem('nsCalibration')
      .catch(error => {
        console.log('Error getting rig calibration: ' + error);
      });

    console.log('SyncNS Rig calibration:');
    console.log(rigCal);

    if (NSCal) {
      if (!rigCal) {
        console.log('No rig calibration, storing NS calibration');

        if (sensorInsert.diff(moment(NSCal.date)) > 0) {
          console.log('Found sensor insert after latest NS calibration. Not updating local rig calibration');
        } else {
          storage.setItem('nsCalibration', NSCal)
            .catch(() => {
              console.log('Unable to store NS Calibration');
            });
        }
      } else if (rigCal.date < NSCal.date) {
        console.log('NS calibration more recent than rig calibration NS Cal Date: ' + NSCal.date + ' Rig Cal Date: ' + rigCal.date);

        storage.setItem('nsCalibration', NSCal)
          .catch(() => {
            console.log('Unable to store NS Calibration');
          });
      } else if (rigCal.date > NSCal.date) {
        console.log('Rig calibration more recent than NS calibration NS Cal Date: ' + NSCal.date + ' Rig Cal Date: ' + rigCal.date);
        console.log('Upoading rig calibration');

        xDripAPS.postCalibration(rigCal);
      } else {
        console.log('Rig and NS calibration dates match - no sync needed');
      }
    } else {
      if (rigCal) {
        console.log('No NS calibration - uploading rig calibration');
        xDripAPS.postCalibration(rigCal);
      } else {
        console.log('No rig or NS calibration');
      }
    }

    unlockSGVStorage();
  };

  const syncSGVs = async () => {
    let timeSince = null;

    let rigSGVs = null;
    let NSSGVs = null;

    timeSince = moment().subtract(24, 'hours');

    NSSGVs = await xDripAPS.SGVsSince(timeSince, 12*24*2)
      .catch(error => {
        console.log('Error getting NS SGVs: ' + error);
        return;
      });

    if (NSSGVs) {
      console.log('SyncNS NS SGVs: ' + NSSGVs.length);

      NSSGVs = _.sortBy(NSSGVs, ['date']);

      if (NSSGVs.length > 0) {
        console.log(NSSGVs[0]);
      }
    }

    await lockSGVStorage();

    rigSGVs = await storage.getItem('glucoseHist')
      .catch(error => {
        console.log('Error getting rig SGVs: ' + error);
      });

    if (rigSGVs) {
      console.log('SyncNS Rig SGVs: ' + rigSGVs.length);

      // we can assume the rigSGVs are sorted since we sort before
      // storing them

      if (rigSGVs.length > 0) {
        console.log(rigSGVs[0]);
      }
    }

    if (NSSGVs && NSSGVs.length > 0) {
      console.log('Have NS SGVs - Need to check for missing SGVs');

      if (rigSGVs) {
        console.log('Have NS and rig SGV values - need to determine which need to merged');
      } else {
        console.log('No rig SGV values - need to store NS SGV values');
      }
    } else {
      if (rigSGVs) {
        console.log('No NS SGVs - need to upload rig SGVs');
      } else {
        console.log('No rig or NS SGVs');
      }
    }

    unlockSGVStorage();
  };

  const syncLSRCalData = async (sensorInsert) => {
    let timeSince = null;
    let NSBGChecks = null;

    timeSince = moment().subtract(40, 'days');

    NSBGChecks = await xDripAPS.BGChecksSince(timeSince)
      .catch(error => {
        console.log('Error getting NS BG Checks: ' + error);
        return;
      });

    if (NSBGChecks) {
      console.log('SyncNS NS BG Checks: ' + NSBGChecks.length);

      if (NSBGChecks.length > 0) {
        console.log(NSBGChecks[0]);
      }
    }
  };

  const syncNS = async () => {
    let sensorInsert = null;

    sensorInsert = await xDripAPS.latestSensorInserted()
      .catch(error => {
        console.log('Unable to get latest sensor inserted record from NS: ' + error);
        return;
      });

    if (!sensorInsert) {
      console.log('No sensor inserted record returned from NS');
    }

    // Do this serially, waiting for each to complete
    // only for the purpose of making sure that
    // if somehow this took longer than 5 minutes
    // we would not have multiple copies running
    // due to the timeout
    await syncNSCal(sensorInsert);

    await syncSGVs();

    await syncLSRCalData(sensorInsert);

    console.log('syncNS complete - setting 5 minute timer');

    setTimeout(() => {
      // Restart the syncNS after 5 minute
      syncNS();
    }, 5 * 60000);
  };

  const processG5CalData = async (calData) => {
    let rigSGVs = null;
    let matchingSGV = null;
    let oldCalData = null;

    console.log('Last calibration: ' + Math.round((Date.now() - calData.date)/1000/60/60*10)/10 + ' hours ago');

    if (calData.glucose > 400 || calData.glucose < 20) {
      console.log('G5 Last Calibration Data glucose out of range - ignoring');
      return;
    }

    oldCalData = await storage.getItem('calibration')
      .catch(error => {
        console.log('Error getting G5 calibration: ' + error);
      });

    if (oldCalData && (Math.abs(oldCalData.date - calData.date) < 2*60*1000)) {
      // The G5 transmitter report varies the time around
      // the real time a little between read events.
      // If they are within two minutes, assume it's the same
      // check and bail out.
      return;
    }

    rigSGVs = await storage.getItem('glucoseHist')
      .catch(error => {
        console.log('Error getting rig SGVs: ' + error);
      });

    if (rigSGVs) {
      // we can assume they are already sorted
      // since we sort before storing them

      matchingSGV = _.find(rigSGVs, (o) => {
        return o.readDate > calData.date;
      });

      if (matchingSGV) {
        console.log('Matching SGV Unfiltered: ' + matchingSGV.unfiltered);
        console.log('Matching Cal SGV: ' + calData.glucose);

        calData.unfiltered = matchingSGV.unfiltered;
      } else {
        calData.unfiltered = null;
      }
    }

    storage.setItem('calibration', calData);

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

      timerObj = setTimeout(() => {
        // Restart the worker after 1 minute
        listenToTransmitter(id);
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

  id = value || '500000';

  syncNS();

  listenToTransmitter(id);

  io.on('connection', async socket => {
    // TODO: should this just be a 'data' message?
    // how do we initialise the connection with
    // all the data it needs?

    console.log('about to emit id ' + id);
    socket.emit('id', id);
    socket.emit('pending', pending);

    let glucoseHist = await storage.getItem('glucoseHist')
      .catch(error => {
        console.log('Unable to get glucoseHist storage item: ' + error);
      });

    if (glucoseHist) {
      socket.emit('glucose', glucoseHist[glucoseHist.length - 1]);
    }

    let calData = await storage.getItem('calibration')
      .catch(error => {
        console.log('Unable to get calibration storage item: ' + error);
      });

    if (calData) {
      socket.emit('calibrationData', calData);
    }

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
    socket.on('calibrate', glucose => {
      console.log('received calibration of ' + glucose);
      pending.push({date: Date.now(), type: 'CalibrateSensor', glucose});
      io.emit('pending', pending);
    });
    socket.on('id', value => {
      if (value.length != 6) {
        console.log('received invalid transmitter id of ' + value);
      } else {
        clearTimeout(timerObj);

        if (worker !== null) {
          try {
            console.log('Attempting to kill worker for old id');
            worker.kill('SIGTERM');
          } catch (error) {
            console.log('Error killing old worker: ' + error);
          }
        }

        // Remove the old BT device
        removeBTDevice(id);

        console.log('received id of ' + value);
        id = value;

        storage.setItemSync('id', id);
        // TODO: clear glucose on new id
        // use io.emit rather than socket.emit
        // since we want to notify all connections
        io.emit('id', id);

        listenToTransmitter(id);
      }
    });
  });

};
