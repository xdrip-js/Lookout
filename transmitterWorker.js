const Debug = require('debug');

const log = Debug('transmitterWorker:log');
/* eslint-disable-next-line no-unused-vars */
const error = Debug('transmitterWorker:error');
/* eslint-disable-next-line no-unused-vars */
const debug = Debug('transmitterWorker:debug');

const Transmitter = require('xdrip-js');

const id = process.argv[2];
const altBtChannel = parseInt(process.argv[3], 10);

let key = process.argv[4]?.trim() || null;
if (key?.length === 0) {
  key = null;
}

const macAddress = process.argv[5]?.trim() || null;

// G7 sensor slot (1 medical, 2 phone, 3 watch), chosen by transmitterIO
const displayType = parseInt(process.argv[6], 10) || null;

// Only connect to this sensor address, if given (never pair with other people's sensors nearby)
const sensorAddress = process.argv[7]?.trim() || null;

/* eslint-disable-next-line no-unused-vars */
const getMessages = () => new Promise((resolve, reject) => {
  process.on('message', (messages) => {
    resolve(messages);
  });
  // TODO: consider adding a timeout here, with resolve([]), or reject
  process.send({ msg: 'getMessages' });
});

const btChannel = altBtChannel ? 'alternate' : 'standard';

log(`kicking off using ${btChannel} Bluetooth channel`);

const transmitter = new Transmitter(id, getMessages, altBtChannel, key, macAddress, {
  displayType,
  sensorAddress,
  // no saved key => next connection is a first G7 pairing; pre-warm the crypto
  warmUp: !key,
});

transmitter.on('glucose', (glucose) => {
  process.send({ msg: 'glucose', data: glucose });
});

transmitter.on('messageProcessed', (data) => {
  process.send({ msg: 'messageProcessed', data });
});

transmitter.on('calibrationData', (data) => {
  process.send({ msg: 'calibrationData', data });
});

transmitter.on('batteryStatus', (data) => {
  process.send({ msg: 'batteryStatus', data });
});

transmitter.on('version', (data) => {
  process.send({ msg: 'version', data });
});

transmitter.on('sawTransmitter', (data) => {
  process.send({ msg: 'sawTransmitter', data });
});

transmitter.on('backfillData', (data) => {
  process.send({ msg: 'backfillData', data });
});

transmitter.on('sensorKey', (data) => {
  process.send({ msg: 'sensorKey', data });
});

transmitter.on('disconnect', process.exit);
