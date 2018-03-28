const xDripAPS = require("./xDripAPS")();
const calibration = require('./calibration');
const storage = require('node-persist');
const cp = require('child_process');
const request = require('request-promise-native');
const moment = require('moment');
var _ = require('lodash');

module.exports = (io, extend_sensor_opt, expired_tx_opt) => {
  let id;
  let pending = [];
  let extend_sensor = extend_sensor_opt;
  let expired_tx = expired_tx_opt;

  if (expired_tx) {
    console.log('-expired_tx option true');
    }
  else {
    console.log('-expired_tx option false');
    }
  
  const removeBTDevice = (id) => {
    var btName = "Dexcom"+id.slice(-2);

    cp.exec('bt-device -r '+btName, (err, stdout, stderr) => {
      if (err) {
        console.log('Unable to remove BT Device: '+btName);
        return;
      }

      console.log('Removed BT Device: '+btName);
      console.log(`stdout: ${stdout}`);
      console.log(`stderr: ${stderr}`);
    });
  }

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
      // Suitable values need to be:
      //   less than 300 mg/dl
      //   greater than 80 mg/dl
      //   calibrated via G5, not Lookout
      //   12 minutes after the last G5 calibration time (it takes up to 2 readings to reflect calibration updates)
      for (i=0; i < glucoseHist.length; ++i) {
        let sgv = glucoseHist[i];
  
        if ((sgv.readDate > (lastG5CalTime + 12*60*1000)) && (sgv.glucose < 300) && (sgv.glucose > 80) && sgv.g5calibrated) {
          calPairs.push(sgv);
        }
      }

      // If we have at least 3 good pairs, use LSR
      if (calPairs.length > 3) {
        calResult = calibration.lsrCalibration(calPairs);

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
        calResult = calibration.singlePointCalibration(calPairs);

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
  }

  const sensorInsertedCheck = (lastCal) => {
      const secret = process.env.API_SECRET;
      let ns_url = process.env.NIGHTSCOUT_HOST + '/api/v1/treatments.json?';

      // time format needs to match the output of 'date -d "3 hours ago" -Iminutes -u'
      let ns_query = 'find\[created_at\]\[\$gte\]=' + moment().subtract(3, 'hours').toISOString() + '&find\[eventType\]\[\$regex\]=Sensor';

      let ns_headers = {
          'Content-Type': 'application/json'
      };

      if (secret.startsWith("token=")) {
        ns_url = ns_url + secret + '&';
      } else {
        ns_headers = {
          'Content-Type': 'application/json',
          'API-SECRET': secret
        };

      }

      ns_url = ns_url + ns_query;

      let optionsNS = {
          url: ns_url,
          method: 'GET',
          headers: ns_headers,
          json: true
      };

      return request(optionsNS);
  }

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

    n=sgvArr.length;

    let firstSGV = sgvArr[0].glucose * 1000.0;
    let firstTime = sgvArr[0].readDate / 1000.0 * 30.0;

    let lastSGV = sgvArr[n-1].glucose * 1000.0;
    let lastTime = sgvArr[n-1].readDate / 1000.0 * 30.0;

    let xarr = [];

    for (var i=0; i < n; i++) {
      xarr.push(sgvArr[i].readDate / 1000.0 * 30.0 - firstTime);
    }

    // sod = sum of distances
    var sod=0;
    var lastDelta=0

    for (var i=1; i < n; i++) {
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

    if ((n < MINRECORDS) || (sod == 0)) {
      // assume no noise if no records
      noise = 0;
    } else {
      noise=1 - (overallsod/sod);
    }

    return noise;
  }

  // Return 10 minute trend total
  const calcTrend = (glucoseHist) => {
    let direction = "NONE";
    let sgvHist = null;
    let totalDelta = 0;

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
  }

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
  }

  const processNewGlucose = (sgv) => {
    let lastCal = null;
    let glucoseHist = [];
    let checkingSensorInsert = false;
    let sendSGV = true;

  var d= new Date(sgv.readDate);

//  console.log('glucose.status= '+glucose.status);

//  const glucJ = JSON.stringify(glucose);
//  console.log("glucose record below");
//  console.log(glucJ);

  if (expired_tx) {
    const entry = [{
        'device': id,
        'date': sgv.readDate,
        'dateString': new Date(sgv.readDate).toISOString(),
        'sgv': Math.round(sgv.unfiltered/1000),
        'direction': 'None',
        'type': 'sgv',
        'filtered': Math.round(sgv.filtered),
        'unfiltered': Math.round(sgv.unfiltered),
        'rssi': "100", // TODO: consider reading this on connection and reporting
        'noise': "1",
        'trend': sgv.trend,
        'glucose': Math.round(sgv.glucose)
      }];

    const data = JSON.stringify(entry);
    if(sgv.unfiltered > 500000 || sgv.unfiltered < 30000) // for safety, I'm assuming it is erroneous and ignoring
    { 
      console.log("Error - bad glucose data, not processing");
      return;
    }

  //console.log('data = '+data);
    
    var fs1 = require('fs'),
       spawn = require('child_process').spawn,
       out = fs1.openSync('/var/log/openaps/lookout-loop.log', 'a'),
       err = fs1.openSync('/var/log/openaps/lookout-loop.log', 'a');

    var cmd =  'echo \''+data+'\' > /root/src/Lookout/g5entry.json && /root/src/Lookout/process-entry.sh ';
    console.log('cmd = '+cmd);
    var child = spawn(cmd, [], {
      detached: true,
      shell: '/bin/bash',
      stdio: [ 'ignore', out, err ]
    });

    child.unref();
    return;
  }

    sgv.g5calibrated = true;

    storage.getItem('nsCalibration')
    .then(calibration => {
      lastCal = calibration;
    })
    .catch(() => {
      lastCal = null;
      console.log('Unable to obtain current NS Calibration');
    })
    .then(() => {
      return storage.getItem('glucoseHist');
    })
    .then(storedGlucoseHist => {
      glucoseHist = storedGlucoseHist;
    })
    .catch((err) => {
      glucoseHist = [];
      console.log('Error getting glucoseHist: ' + err);
    })
    .then(() => {
        return storage.getItem('calibration');
    })
    .catch((err) => {
      console.log('Error getting lastG5CalData: ' + err);
    })
    .then((storedLastG5CalData) => {
      var lastG5CalTime = 0;
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
        .then(() => {
          xDripAPS.postCalibration(newCal);
        })
        .catch(() => {
          console.log('Unable to post new NS Calibration to Nightscout');
        });
      }

      if (!sgv.glucose && extend_sensor && lastCal) {
        sgv.glucose = Math.round((sgv.unfiltered-lastCal.intercept)/lastCal.slope);

        console.log('Invalid glucose value received from transmitter, replacing with calibrated unfiltered value');
        console.log('Calibrated SGV: ' + sgv.glucose + ' unfiltered: ' + sgv.unfiltered + ' slope: ' + lastCal.slope + ' intercept: ' + lastCal.intercept);

        sgv.g5calibrated = false;

        // Check if a new sensor has been inserted.
        // If it has been, it will clear the calibration value
        // and abort sending the SGV
        checkingSensorInsert = true;
        return sensorInsertedCheck(lastCal);
      } else {
        return null;
      }
    })
    .then((body) => {

      if (checkingSensorInsert) {
          if ((body.length > 0) && (moment(body[0]['created_at']).diff(moment(lastCal.date)) > 0)) {
            console.log('Found sensor insert after latest calibration. Deleting calibration data.');
            storage.del('nsCalibration');
            storage.del('glucoseHist');
            sendSGV = false;
          }
      }

      if (!sendSGV) {
        return null;
      }

      if (!sgv.glucose) {
        console.log('No valid glucose to send. Doing nothing.');
        return null;
      }

      glucoseHist.push(sgv);

      sgv.trend = calcTrend(glucoseHist);

      sgv.noise = calcSensorNoise(glucoseHist);

      sgv.nsNoise = calcNSNoise(sgv.noise, glucoseHist);

      console.log('Current sensor trend: ' + Math.round(sgv.trend*10)/10 + ' Sensor Noise: ' + Math.round(sgv.noise*1000)/1000 + ' NS Noise: ' + sgv.nsNoise);

      storeNewGlucose(glucoseHist);
      sendNewGlucose(sgv);
    })
    .catch((err) => {
      console.log('Process SGV Error: ' + err);
    })
  }

  // Store the last hour of glucose readings
  const storeNewGlucose = (glucoseHist) => {

      glucoseHist = _.sortBy(glucoseHist, ['readDate']);

      var minDate = moment().subtract(1, 'hours');
      var sliceStart = 0;

      // only the store the last hour of glucose
      // the primary use is to determine the
      // trend and the noise values
      for (var i=0; i < glucoseHist.length; ++i) {
        if (moment(glucoseHist[i].readDate).diff(minDate) < 0) {
          sliceStart = i+1;
        }
      }

      glucoseHist = glucoseHist.slice(sliceStart);

      storage.setItem('glucoseHist', glucoseHist)
      .catch((err) => {
        console.log('Unable to store glucoseHist: ' + err);
      });
  }

  const sendNewGlucose = (sgv) => {
    io.emit('glucose', sgv);
    xDripAPS.post(sgv);
  }

  // TODO: this should timeout, and cancel when we get a new id.
  const listenToTransmitter = (id) => {
    const worker = cp.fork(__dirname + '/transmitter-worker', [id], {
      env: {
        DEBUG: 'transmitter,bluetooth-manager'
      }
    });

    worker.on('message', m => {
      if (m.msg == "getMessages") {
        worker.send(pending);
        // NOTE: this will lead to missed messages if the rig
        // shuts down before acting on them, or in the
        // event of lost comms
        // better to return something from the worker
        io.emit('pending', pending);
      } else if (m.msg == "glucose") {
        const glucose = m.data;
        console.log('got glucose: ' + glucose.glucose + ' unfiltered: ' + glucose.unfiltered);
        processNewGlucose(glucose);
      } else if (m.msg == 'messageProcessed') {
        // TODO: check that dates match
        pending.shift();
        io.emit('pending', pending);
      } else if (m.msg == "calibrationData") {
        // TODO: save to node-persist?
        console.log('Last calibration: ' + Math.round((Date.now() - m.data.date)/1000/60/60*10)/10 + ' hours ago');
        storage.setItem('calibration', m.data)
        .then(() => {
          io.emit('calibrationData', m.data);
        })
      }
    });

    worker.on('exit', function(m) {
      // Receive results from child process
      console.log('exited');
      setTimeout(() => {
        // Remove the BT device so it starts from scratch
        removeBTDevice(id);

        listenToTransmitter(id);
      }, 60000);
    });
  }

  // handle persistence here
  // make the storage direction relative to the install directory,
  // not the calling directory
  storage.init({dir: __dirname + '/storage'}).then(() => {
    return storage.getItem('id');
  })
  .then(value => {
    id = value || '500000';

    // Remove the BT device so it starts from scratch
    removeBTDevice(id);

    listenToTransmitter(id);

    io.on('connection', socket => {
      // TODO: should this just be a 'data' message?
      // how do we initialise the connection with
      // all the data it needs?

      console.log("about to emit id " + id);
      socket.emit('id', id);
      socket.emit('pending', pending);
      storage.getItem('glucoseHist')
      .then(glucoseHist => {
        if (glucoseHist) {
          socket.emit('glucose', glucoseHist[glucoseHist.length - 1]);
        }
      });
      storage.getItem('calibration')
      .then(calibration => {
        if (calibration) {
          socket.emit('calibrationData', calibration);
        }
      });
      socket.on('startSensor', () => {
        console.log('received startSensor command');
        pending.push({date: Date.now(), type: "StartSensor"});
        io.emit('pending', pending)
      });
      socket.on('stopSensor', () => {
        console.log('received stopSensor command');
        pending.push({date: Date.now(), type: "StopSensor"});
        io.emit('pending', pending)
      });
      socket.on('calibrate', glucose => {
        console.log('received calibration of ' + glucose);
        pending.push({date: Date.now(), type: "CalibrateSensor", glucose});
        io.emit('pending', pending)
      });
      socket.on('id', value => {
        // Remove the old BT device so it starts from scratch
        removeBTDevice(id);

        console.log('received id of ' + value);
        id = value;
        storage.setItemSync('id', id);
        // TODO: clear glucose on new id
        // use io.emit rather than socket.emit
        // since we want to nofify all connections
        io.emit('id', id);
        // const status = {id};
        // console.log(JSON.stringify(status));
        // fs.writeFile(__dirname + '/status.json', JSON.stringify(status), (err) => {
        //   if (err) {
        //     console.error(err);
        //     return;
        //   }
        //   console.log("File has been created");
        // });
      });
    });
  });
  // let status = {};
  // try {
  //   status = require('./status');
  // } catch (err) {}
  // const id = status.id || '500000';

};
