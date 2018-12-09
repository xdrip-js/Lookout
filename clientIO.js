
const Debug = require('debug');

const log = Debug('clientIO:log');
/* eslint-disable-next-line no-unused-vars */
const error = Debug('clientIO:error');
const debug = Debug('clientIO:debug');

const express = require('express');
const socketIO = require('socket.io');
const LoopIO = require('./loopIO');
const PumpIO = require('./pumpIO');

// Create a Lookout GUI HTTP server
module.exports = (options) => {
  let transmitter = null;
  let fakeMeter = null;

  const server = express()
    .use(express.static(`${__dirname}/public`))
    .use('/node_modules', express.static(`${__dirname}/node_modules`))
    // prevent error message on reloads as per https://stackoverflow.com/a/35284602
    .get('/*', (req, res) => {
      res.sendFile(`${__dirname}/public/index.html`);
    })
    .listen(options.port, () => log(`Listening on ${options.port}`));

  const io = socketIO(server);

  // /cgm path is handled by this module
  const cgmIO = io.of('/cgm');

  // /loop path provides Loop status obtained from the OpenAPS directory
  LoopIO(io.of('/loop'), options);

  // /pump path provides Pump status obtained from the OpenAPS directory
  PumpIO(io.of('/pump'), options);

  const initClient = async (socket) => {
    const txId = transmitter ? transmitter.getTxId() : null;
    debug(`about to emit id ${txId}`);

    if (txId) {
      socket.emit('id', txId);
    }

    const meterId = fakeMeter ? await fakeMeter.getMeterId() : null;
    if (meterId) {
      socket.emit('meterid', meterId);
    }

    const pending = transmitter ? transmitter.getPending() : null;
    if (pending) {
      socket.emit('pending', pending);
    }

    const glucose = transmitter ? await transmitter.getGlucose() : null;
    if (glucose) {
      socket.emit('glucose', glucose);
    }

    const glucoseHist = transmitter ? await transmitter.getHistory() : null;
    if (glucoseHist) {
      socket.emit('glucoseHistory', glucoseHist);
    }

    const lastTxmitterCal = transmitter ? await transmitter.getLastCal() : null;
    if (lastTxmitterCal) {
      socket.emit('calibrationData', lastTxmitterCal);
    }
  };

  cgmIO.on('connection', async (socket) => {
    // TODO: should this just be a 'data' message?
    // how do we initialise the connection with
    // all the data it needs?
    log('Client connected');

    socket.on('disconnect', () => log('Client disconnected'));

    initClient(socket);

    socket.on('resetTx', () => {
      debug('received resetTx command');

      if (transmitter) {
        transmitter.resetTx();
      }
    });
    socket.on('startSensor', () => {
      debug('received startSensor command');

      if (transmitter) {
        transmitter.startSensor();
      }
    });
    socket.on('backStartSensor', () => {
      debug('received backStartSensor command');

      if (transmitter) {
        transmitter.backStartSensor();
      }
    });
    socket.on('stopSensor', () => {
      debug('received stopSensor command');

      if (transmitter) {
        transmitter.stopSensor();
      }
    });
    socket.on('calibrate', (glucose) => {
      debug(`received calibration of ${glucose}`);

      if (transmitter) {
        transmitter.calibrate(glucose);
      }
    });
    socket.on('id', (value) => {
      debug(`received transmitter id of ${value}`);

      if (transmitter) {
        transmitter.setTxId(value);
      }
    });
    socket.on('meterid', (value) => {
      debug(`received meter id of ${value}`);

      if (fakeMeter) {
        fakeMeter.setMeterId(value);
      }
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

    // Send an updated transmitter ID to all connected clients.
    meterId: (meterId) => {
      cgmIO.emit('meterid', meterId);
    },

    // Set the transmitter object that can be used
    // to get data from the transmitter and
    // send commands to the transmitter from the client.
    setTransmitter: (txmitter) => {
      transmitter = txmitter;
    },

    // Set the fakemeter object that can be used
    // to get data from the fakemeter and
    // send commands to the fakemeter from the client.
    setFakeMeter: (meter) => {
      fakeMeter = meter;
    },
  };
};
