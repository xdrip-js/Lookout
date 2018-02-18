const xDripAPS = require("./xDripAPS")();
const storage = require('node-persist');
const cp = require('child_process');
const request = require('request-promise-native');
const moment = require('moment');

module.exports = (io, extend_sensor_opt) => {
  let id;
  let pending = [];
  let extend_sensor = extend_sensor_opt;

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

  const calculateNewNSCalibration = (lastCal, lastSGV, currSGV) => {
    // set it to a high number so we upload a new cal
    // if we don't have a previous calibration

    // Do not calculate a new calibration value
    // if we don't have a valid calibrated glucose reading
    if (currSGV.glucose > 800 || currSGV.glucose < 20) {
      console.log('Current glucose out of range to calibrate: ' + currSGV.glucose);
      return null;
    }

    var calErr = 100;
    var calValue;

    if (lastCal) {
      calValue = (currSGV.unfiltered-lastCal.intercept)/lastCal.slope;
      calErr = calValue - currSGV.glucose;

      console.log('Current calibration error: ' + calErr + ' calibrated value: ' + calValue + ' slope: ' + lastCal.slope + ' intercept: ' + lastCal.intercept);
    }

    // Check if we need a calibration and if so, make sure we have enough
    // separation between the numbers to get a meaningful calibration.
    if (!lastCal || (Math.abs(calErr) > 5)) {
      if ((Math.abs(lastSGV.unfiltered - currSGV.unfiltered) > 2) && (Math.abs(lastSGV.glucose - currSGV.glucose) > 2)) {
        var scale = 1.0;
        var slope =  (lastSGV.unfiltered - currSGV.unfiltered) / (lastSGV.glucose - currSGV.glucose);
        var intercept = currSGV.unfiltered - currSGV.glucose*slope;

        if ((slope > 12.5) || (slope < 0.75)) {
          // wait until the next opportunity
          console.log('Slope out of range to calibrate: ' + slope);
          return null;
        }

        return {
          date: Date.now(),
          scale: scale,
          intercept: intercept,
          slope: slope
        };
      } else {
        console.log('Calibration needed, but not enough separation between last and current values.');
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

  const storeAndPostNewGlucose = (sgv) => {
    let lastCal = null;
    let sgvSent = false;

    storage.getItem('nsCalibration')
    .then(calibration => {
      lastCal = calibration;
    })
    .catch(() => {
      lastCal = null;
      console.log('Unable to obtain current NS Calibration');
    })
    .then(() => {
      return storage.getItem('glucose');
    })
    .then(lastSGV => {
      var newCal = calculateNewNSCalibration(lastCal, lastSGV, sgv);

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
        sgv.trend = 0;

        console.log('Invalid glucose value received from transmitter, replacing with calibrated unfiltered value');
        console.log('Calibrated SGV: ' + sgv.glucose + ' unfiltered: ' + sgv.unfiltered + ' slope: ' + lastCal.slope + ' intercept: ' + lastCal.intercept);

        // Check if a new sensor has been inserted.
        // If it has been, it will clear the calibration value
        // limiting an incorrect SGV to just one.
        sensorInsertedCheck(lastCal)
        .then((body) => {
          if ((body.length > 0) && (moment(body[0]['created_at']).diff(moment(lastCal.date)) > 0)) {
            console.log('Found sensor insert after latest calibration. Deleting calibration data.');
            storage.del('nsCalibration');
            storage.del('glucose');
          } else {
            io.emit('glucose', sgv);
            xDripAPS.post(sgv);
            sgvSent = true;
          }
        })
        .catch((err) => {
          console.log('Unable to query NS for sensor insert.');
          io.emit('glucose', sgv);
          xDripAPS.post(sgv);
          sgvSent = true;
        });
      } else {
        io.emit('glucose', sgv);
        xDripAPS.post(sgv);
        sgvSent = true;
      }
    })
    .catch(() => {
      console.log('Failure getting previous gluclose value or new calibration required test or new calibration calculation.');
    })
    .finally(() => {
      if (!sgvSent) {
        io.emit('glucose', sgv);
        xDripAPS.post(sgv);
      }

      return storage.setItem('glucose', sgv);
    })
    .catch(() => {
      console.log('Unable to store current SGV');
    });
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
        storeAndPostNewGlucose(glucose);
      } else if (m.msg == 'messageProcessed') {
        // TODO: check that dates match
        pending.shift();
        io.emit('pending', pending);
      } else if (m.msg == "calibrationData") {
        // TODO: save to node-persist?
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
      storage.getItem('glucose')
      .then(glucose => {
        if (glucose) {
          socket.emit('glucose', glucose);
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
