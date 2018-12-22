const _ = require('lodash');

const Debug = require('debug');

const log = Debug('transmitterWorker:log');
/* eslint-disable-next-line no-unused-vars */
const error = Debug('transmitterWorker:error');
/* eslint-disable-next-line no-unused-vars */
const debug = Debug('transmitterWorker:debug');

const prevGlucose = parseInt(process.argv[2], 10);

/* eslint-disable-next-line no-unused-vars */
const getMessages = () => new Promise((resolve, reject) => {
  process.on('message', (messages) => {
    resolve(messages);
  });
  // TODO: consider adding a timeout here, with resolve([]), or reject
  process.send({ msg: 'getMessages' });
});

log('kicking off');

const glucose = {
  inSession: true,
  glucose: 120,
  trend: 0,
  readDate: Date.now(),
  state: 6,
  status: 0x83,
  filtered: 144000,
  unfiltered: 144000,
  sessionStartDate: Date.now() - 3 * 24 * 60 * 60000,
  activationDate: Date.now() - 17 * 24 * 60 * 60 * 1000,
};

/* eslint-disable-next-line no-unused-vars */
const calibration = {
  date: Date.now() - 12 * 60 * 60 * 1000,
  glucose: 100,
};

const batteryStatus = {
  status: 0,
  voltagea: 316,
  voltageb: 308,
  resist: 439,
  runtime: 47,
  temperature: 33,
  timestamp: Date.now(),
};

/* eslint-disable-next-line no-unused-vars */
let counter = 0;

setInterval(async () => {
  glucose.glucose = prevGlucose + 1;
  glucose.readDate = Date.now();
  glucose.readDateMills = Date.now();
  glucose.trend += 10;

  let sendBattery = false;

  counter += 1;

  if (glucose.trend >= 40) {
    glucose.trend -= 70;
  }

  const messages = await getMessages();

  _.each(messages, (msg) => {
    log('Received messages:\n', msg);
    process.send({ msg: 'messageProcessed', data: { time: msg.date } });

    if (msg === 'BatteryStatus') {
      sendBattery = true;
    }
  });

  process.send({ msg: 'glucose', data: glucose });

  // process.send({msg: 'calibrationData', data: calibration });

  if (sendBattery) {
    process.send({ msg: 'batteryStatus', data: batteryStatus });
  }

  process.send({ msg: 'sawTransmitter', data: {} });

  process.exit();
}, 0.2 * 60000);
