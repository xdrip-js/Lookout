
const LoopIO = require('./loopIO');
const PumpIO = require('./pumpIO');
const express = require('express');
const socketIO = require('socket.io');

// Create a Lookout GUI HTTP server
module.exports = (options) => {

  let transmitter = null;

  const server = express()
    .use(express.static(__dirname + '/public'))
    .use('/node_modules', express.static(__dirname + '/node_modules'))
    // prevent error message on reloads as per https://stackoverflow.com/a/35284602
    .get('/*', function(req, res){
      res.sendFile(__dirname + '/public/index.html');
    })
    .listen(options.port, () => console.log(`Listening on ${ options.port }`));

  const io = socketIO(server);

  // /cgm path is handled by this module
  const cgmIO = io.of('/cgm');

  // /loop path provides Loop status obtained from the OpenAPS directory
  LoopIO(io.of('/loop'), options);

  // /pump path provides Pump status obtained from the OpenAPS directory
  PumpIO(io.of('/pump'), options);

  const initClient = async (socket) => {
    let txId = transmitter && transmitter.getTxId() || null;
    console.log('about to emit id ' + txId);

    if (txId) {
      socket.emit('id', txId);
    }

    let pending = transmitter && transmitter.getPending() || null;
    if (pending) {
      socket.emit('pending', pending);
    }

    let glucose = transmitter && await transmitter.getGlucose() || null;
    if (glucose) {
      socket.emit('glucose', glucose);
    }

    let glucoseHist = transmitter && await transmitter.getHistory() || null;
    if (glucoseHist) {
      socket.emit('glucoseHistory', glucoseHist);
    }

    let lastG5Cal = transmitter && await transmitter.getLastCal() || null;
    if (lastG5Cal) {
      socket.emit('calibrationData', lastG5Cal);
    }
  };

  cgmIO.on('connection', async socket => {
    // TODO: should this just be a 'data' message?
    // how do we initialise the connection with
    // all the data it needs?
    console.log('Client connected');

    socket.on('disconnect', () => console.log('Client disconnected'));

    initClient(socket);

    socket.on('resetTx', () => {
      console.log('received resetTx command');

      transmitter && transmitter.resetTx();

      let pending = transmitter && transmitter.getPending() || null;

      if (pending) {
        cgmIO.emit('pending', pending);
      }
    });
    socket.on('startSensor', () => {
      console.log('received startSensor command');

      transmitter && transmitter.startSensor();

      let pending = transmitter && transmitter.getPending() || null;

      if (pending) {
        cgmIO.emit('pending', pending);
      }
    });
    socket.on('backStartSensor', () => {
      console.log('received backStartSensor command');

      transmitter && transmitter.backStartSensor();

      let pending = transmitter && transmitter.getPending() || null;

      if (pending) {
        cgmIO.emit('pending', pending);
      }
    });
    socket.on('stopSensor', () => {
      console.log('received stopSensor command');

      transmitter && transmitter.stopSensor();

      let pending = transmitter && transmitter.getPending() || null;

      if (pending) {
        cgmIO.emit('pending', pending);
      }
    });
    socket.on('calibrate', glucose => {
      console.log('received calibration of ' + glucose);

      transmitter && transmitter.calibrate(glucose);

      let pending = transmitter && transmitter.getPending() || null;

      if (pending) {
        cgmIO.emit('pending', pending);
      }
    });
    socket.on('id', value => {
      console.log('received transmitter id of ' + value);

      transmitter && transmitter.setTxId(value);

      let txId = transmitter && transmitter.getTxId() || null;

      cgmIO.emit('id', txId);
    });
  });

  // Return an object that can be used to interact with the
  // client.
  return {
    // Send a new SGV to all connected clients.
    newSGV: (sgv) => {
      cgmIO.emit('glucose', sgv);
    },

    // Send a new Cal to all connected clients.
    newCal: (cal) => {
      cgmIO.emit('calibrationData', cal);
    },

    // Send an updated Pending List to all connected clients.
    newPending: (pending) => {
      cgmIO.emit('pending', pending);
    },

    // Send an updated transmitter ID to all connected clients.
    txId: (txId) => {
      cgmIO.emit('id', txId);
    },

    // Set the transmitter object that can be used
    // to get data from the transmitter and
    // send commands to the transmitter from the client.
    setTransmitter: (txmitter) => {
      transmitter = txmitter;
    }
  };
};

