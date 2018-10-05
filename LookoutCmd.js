#!/usr/bin/env node

const io = require('socket.io-client');

let command = null;

const argv = require('yargs')
  .command('cal <sgv>', 'Calibration the transmitter with provided glucose meter reading', (yargs) => {
    yargs.positional('sgv', {
        describe: 'glucose value from meter',
        type: 'number',
        required: true
      })
  })
  .command('id <id>', 'Set transmitter ID', (yargs) => {
    yargs.positional('id', {
        describe: 'transmitter serial number',
        type: 'string',
        required: true
      })
  })
  .command('start', 'Start sensor session')
  .command('back-start', 'Start sensor session back dated by 2 hours')
  .command('stop', 'Stop sensor session')
  .command('reset', 'Reset transmitter')
  .demandCommand(1, 'Must provide a valid command')
  .help()
  .wrap(null)
  .strict(true)
  .help('help');

const params = argv.argv;
command = params._.shift();

let requestOptions = null;
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

console.log(command);
console.log(params);

socket.on('connect', () => {
  socket.emit(sendCmd, sendArg);
});

