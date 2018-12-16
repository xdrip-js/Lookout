#!/usr/bin/env node

/* eslint-disable no-console */

const io = require('socket.io-client');
const moment = require('moment');
const yargs = require('yargs');
const prompt = require('./prompt');

let sendCommand = null;

const argv = yargs
  .command('cal <sgv>', 'Calibrate the transmitter with provided glucose meter reading', (yargsp) => {
    yargsp.positional('sgv', {
      describe: 'glucose value from meter',
      type: 'number',
      required: true,
    });
  })
  .command('id <id>', 'Set transmitter ID', (yargsp) => {
    yargsp.positional('id', {
      describe: 'transmitter serial number',
      type: 'string',
      required: true,
    });
  })
  .command('meterid <meterid>', 'Set fake meter ID', (yargsp) => {
    yargsp.positional('meterid', {
      describe: 'fake meter id',
      type: 'string',
      required: true,
    });
  })
  .option('mmol', {
    alias: 'm',
    boolean: true,
    describe: 'Use mmol instead of mg/dL',
    default: false,
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
sendCommand = params._.shift();

const processGlucose = (glucose) => {
  const sessionStart = moment(glucose.sessionStartDate);
  const sessionAge = moment.duration(moment().diff(sessionStart));

  const transmitterStart = moment(glucose.transmitterStartDate);
  const transmitterAge = moment.duration(moment().diff(transmitterStart));

  let sgv = glucose.glucose;

  if (params.mmol) {
    sgv = Math.round(sgv / 18 * 10) / 10;
  }

  console.log(`          glucose: ${sgv}`);
  console.log(`            noise: ${Math.round(glucose.noise * 10) / 10}`);
  console.log(`      noise index: ${glucose.nsNoise}`);
  console.log(`        inSession: ${glucose.inSession}`);
  console.log(`     sensor state: ${glucose.stateString}`);
  console.log(`transmitter state: ${glucose.txStatusString}`);
  console.log(`         readDate: ${moment(glucose.readDate).format()}`);
  console.log(`    session start: ${sessionStart.format()}`);
  console.log(`      session age: ${sessionAge.days()} days ${sessionAge.hours()} hours ${sessionAge.minutes()} minutes`);
  console.log(`transmitter start: ${transmitterStart.format()}`);
  console.log(`  transmitter age: ${transmitterAge.days()} days ${transmitterAge.hours()} hours ${transmitterAge.minutes()} minutes`);
  console.log(`        voltage a: ${glucose.voltagea}`);
  console.log(`        voltage b: ${glucose.voltageb}`);
  console.log('\nPress Ctrl-C to Exit');
  console.log('=====================================');
};

const processCommand = async (command) => {
  let sendCmd = null;
  let sendArg = null;

  if (command === 'cal') {
    sendCmd = 'calibrate';

    sendArg = params.sgv;

    if (params.mmol) {
      sendArg *= 18;
    }
  } else if (command === 'start') {
    sendCmd = 'startSensor';
  } else if (command === 'back-start') {
    sendCmd = 'backStartSensor';
  } else if (command === 'stop') {
    const promptStr = [
      'Your current session will be lost and will have to be restarted using \'lookout start\'\n',
      'Are you sure? (y/n) ',
    ].join('\n');

    const answer = await prompt(promptStr);

    if (answer === 'y' || answer === 'Y') {
      sendCmd = 'stopSensor';
    } else {
      console.log('Aborting stop session');
    }
  } else if (command === 'id') {
    sendCmd = 'id';
    sendArg = params.id;
  } else if (command === 'meterid') {
    sendCmd = 'meterid';
    sendArg = params.meterid.padStart(6, 0);
  } else if (command === 'reset') {
    const promptStr = [
      'Running this command will instruct Logger to reset the Dexcom Transmitter!',
      'Your current session will be lost and will have to be restarted using \'lookout start\'\n',
      'Are you sure? (y/n) ',
    ].join('\n');

    const answer = await prompt(promptStr);

    if (answer === 'y' || answer === 'Y') {
      sendCmd = 'resetTx';
    } else {
      console.log('Aborting reset');
    }
  }

  const socket = io('http://localhost:3000/cgm');

  socket.on('connect', () => {
    if (sendCmd) {
      socket.emit(sendCmd, sendArg);
    }

    // Only send it once
    sendCmd = null;
  });

  socket.on('pending', (pending) => {
    console.log('          Pending: ', pending);
  });

  socket.on('id', (id) => {
    console.log('   Transmitter ID: ', id);
  });

  socket.on('meterid', (id) => {
    console.log('    Fake Meter ID: ', id);
  });

  socket.on('glucose', (glucose) => {
    processGlucose(glucose);
  });

  console.log('\nPress Ctrl-C to Exit');
};

processCommand(sendCommand);
