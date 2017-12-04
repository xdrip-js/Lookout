const xDripAPS = require("./xDripAPS")();
const storage = require('node-persist');
const cp = require('child_process');

module.exports = (io) => {
  let id;
  let pending = [];

  // TODO: this should timeout, and cancel when we get a new id.
  const listenToTransmitter = (id) => {
    const worker = cp.fork('./transmitter-worker', [id], {
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
        pending = [];
        io.emit('pending', pending);
      } else if (m.msg == "glucose") {
        const glucose = m.data;
        console.log('got glucose: ' + glucose.glucose);
        storage.setItem('glucose', glucose)
        .then(() => {
          io.emit('glucose', glucose);
          xDripAPS.post(glucose);
        });
      }
    });

    worker.on('exit', function(m) {
      // Receive results from child process
      console.log('exited');
      setTimeout(() => {
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
          socket.emit('calibration', calibration);
        }
      });
      socket.on('startSensor', () => {
        console.log('received startSensor command');
        // transmitter.startSensor();
      });
      socket.on('stopSensor', () => {
        console.log('received stopSensor command');
      });
      socket.on('calibrate', glucose => {
        console.log('received calibration of ' + glucose);
        pending.push({date: Date.now(), glucose});
        io.emit('pending', pending)
        // transmitter.calibrate(glucose);
        // const pending = transmitter.calibrate(glucose);
        // storage.setItemSync('calibration', pending);
        // io.emit('calibration', pending);
      });
      socket.on('id', value => {
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
