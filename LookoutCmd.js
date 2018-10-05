#!/usr/bin/env node

const io = require('socket.io-client');
const moment = require('moment');

let command = null;

const argv = require('yargs')
  .command('cal <sgv>', 'Calibration the transmitter with provided glucose meter reading', (yargs) => {
    yargs.positional('sgv', {
      describe: 'glucose value from meter',
      type: 'number',
      required: true
    });
  })
  .command('id <id>', 'Set transmitter ID', (yargs) => {
    yargs.positional('id', {
      describe: 'transmitter serial number',
      type: 'string',
      required: true
    });
  })
  .command('start', 'Start sensor session')
  .command('back-start', 'Start sensor session back dated by 2 hours')
  .command('stop', 'Stop sensor session')
  .command('reset', 'Reset transmitter')
  .command(['status', '$0'], 'Show status')
  .help()
  .wrap(null)
  .strict(true)
  .help('help');

const params = argv.argv;
command = params._.shift();

let socket = io('http://localhost:3000/cgm');
let sendCmd = null;
let sendArg = null;

if (command === 'cal') {
  sendCmd = 'calibrate';
  sendArg = params.sgv;
} else if (command === 'start') {
  sendCmd = 'startSensor';
} else if (command === 'back-start') {
  sendCmd = 'backStartSensor';
} else if (command === 'stop') {
  sendCmd = 'stopSensor';
} else if (command === 'id') {
  sendCmd = 'id';
  sendArg = params.id;
} else if (command === 'reset') {
  sendCmd = 'resetTx';
}

socket.on('pending', (pending) => {
  console.log('          Pending: ', pending);
});

socket.on('id', id => {
  console.log('   Transmitter ID: ', id);
});

socket.on('glucose', glucose => {
  let sessionStart = moment(glucose.sessionStartDate);
  let sessionAge = moment.duration(moment().diff(sessionStart));

  let transmitterStart = moment(glucose.transmitterStartDate);
  let transmitterAge = moment.duration(moment().diff(transmitterStart));

  console.log('          glucose: ' + glucose.glucose);
  console.log('            noise: ' + Math.round(glucose.noise*10)/10);
  console.log('      noise index: ' + glucose.nsNoise);
  console.log('        inSession: ' + glucose.inSession);
  console.log('     sensor state: ' + glucose.stateString);
  console.log('transmitter state: ' + glucose.txStatusString);
  console.log('         readDate: ' + moment(glucose.readDate).format());
  console.log('    session start: ' + sessionStart.format());
  console.log('      session age: ' + sessionAge.days() + ' days ' + sessionAge.hours() + ' hours ' + sessionAge.minutes() + ' minutes');
  console.log('transmitter start: ' + transmitterStart.format());
  console.log('  transmitter age: ' + transmitterAge.days() + ' days ' + transmitterAge.hours() + ' hours ' + transmitterAge.minutes() + ' minutes');
  console.log('=====================================');
});

// No need to print this
//socket.on('glucoseHistory', data => {
//  data && data.length > 0 && console.log(data[data.length-1]);
//});

socket.on('connect', () => {
  sendCmd && socket.emit(sendCmd, sendArg);
});

