const Debug = require('debug');
const log = Debug('transmitterWorker:log');
/*eslint-disable-next-line no-unused-vars*/
const error = Debug('transmitterWorker:error');
/*eslint-disable-next-line no-unused-vars*/
const debug = Debug('transmitterWorker:debug');

const Transmitter = require('xdrip-js');

const id = process.argv[2];

const getMessages = () => {
  /*eslint-disable no-unused-vars*/
  return new Promise((resolve, reject) => {
  /*eslint-enable no-unused-vars*/
    process.on('message', messages => {
      resolve(messages);
    });
    // TODO: consider adding a timeout here, with resolve([]), or reject
    process.send({msg: 'getMessages'});
  });
};

log('kicking off');

const transmitter = new Transmitter(id, getMessages);

transmitter.on('glucose', glucose => {
  process.send({msg: 'glucose', data: glucose});
});

transmitter.on('messageProcessed', data => {
  process.send({msg: 'messageProcessed', data});
});

transmitter.on('calibrationData', data => {
  process.send({msg: 'calibrationData', data});
});

transmitter.on('batteryStatus', data => {
  process.send({msg: 'batteryStatus', data});
});

transmitter.on('sawTransmitter', data => {
  process.send({msg: 'sawTransmitter', data});
});

transmitter.on('backfillData', data => {
  process.send({msg: 'backfillData', data});
});

transmitter.on('disconnect', process.exit);
