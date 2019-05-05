#!/usr/bin/env node

/* eslint-disable no-console */

const io = require('socket.io-client');
const moment = require('moment');
const yargs = require('yargs');
const prompt = require('./prompt');
const constants = require('./constants');

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
  .command('start [sensor_serial_code]', 'Start sensor session (G6 requies serial)', (yargsp) => {
    yargsp.positional('sensor_serial_code', {
      describe: 'G6 Sensor Serial Code',
      type: 'string',
    });
  })
  .command('back-start [sensor_serial_code]', 'Start sensor session back dated by 2 hours (G6 requires serial)', (yargsp) => {
    yargsp.positional('sensor_serial_code', {
      describe: 'G6 Sensor Serial Code',
      type: 'string',
    });
  })
  .command('stop', 'Stop sensor session')
  .command('reset', 'Reset transmitter')
  .command(['status', '$0'], 'Show status')
  .help()
  .wrap(null)
  .strict(true)
  .help('help');

const params = argv.argv;
sendCommand = params._.shift();

const validTxId = (id) => {
  if (!id) {
    return false;
  }

  const prefix = id.substr(0, 1);

  if (id.length !== 6 || (prefix !== '8' && prefix !== '4')) {
    return false;
  }

  return true;
};

const processGlucose = (glucose) => {
  const sessionStart = moment(glucose.sessionStartDate);
  const sessionAge = moment.duration(moment().diff(sessionStart));

  const readDate = moment(glucose.readDate);
  const readEventAge = moment.duration(moment().diff(readDate));

  const transmitterStart = moment(glucose.transmitterStartDate);
  const transmitterAge = moment.duration(moment().diff(transmitterStart));

  let sgv = glucose.glucose;

  if (params.mmol) {
    sgv = Math.round(sgv / 18 * 10) / 10;
  }

  console.log(`          glucose: ${sgv}`);
  console.log(`            noise: ${Math.round(glucose.noise * 10) / 10}`);
  console.log(`      noise index: ${glucose.nsNoise}`);
  console.log(`inTxmitterSession: ${glucose.inSession}`);
  console.log(`     session type: ${glucose.mode}`);
  console.log(`     sensor state: ${glucose.stateString}`);
  console.log(`transmitter state: ${glucose.txStatusString}`);
  console.log(`         readDate: ${readDate.format()}  -- ${readEventAge.hours()} hours ${readEventAge.minutes()} minutes ago`);
  console.log(`    session start: ${sessionStart.format()}`);
  console.log(`      session age: ${sessionAge.days()} days ${sessionAge.hours()} hours ${sessionAge.minutes()} minutes`);
  console.log(`transmitter start: ${transmitterStart.format()}`);
  console.log(`  transmitter age: ${transmitterAge.days()} days ${transmitterAge.hours()} hours ${transmitterAge.minutes()} minutes`);
  console.log(`        voltage a: ${glucose.voltagea}`);
  console.log(`        voltage b: ${glucose.voltageb}`);
  console.log(`      temperature: ${glucose.temperature}`);
  console.log(`       resistance: ${glucose.resistance}`);
  console.log('\nPress Ctrl-C to Exit');
  console.log('=====================================');
};

const processCommand = async (command) => {
  let sendCmd = null;
  let sendArg = null;

  if (command === 'cal') {
    sendCmd = 'calibrate';

    if (Number.isNaN(params.sgv)) {
      console.log('Invalid number argument for cal command');
      process.exit(1);
    }

    sendArg = params.sgv;

    if (params.mmol) {
      sendArg *= 18;
    }

    if (sendArg > constants.MAX_CAL_SGV) {
      console.log(`Calibration, ${sendArg} mg/dL, greater than maximum allowed value: ${constants.MAX_CAL_SGV} mg/dL`);
      process.exit(1);
    } else if (sendArg < constants.MIN_CAL_SGV) {
      console.log(`Calibration, ${sendArg} mg/dL, less than minimum allowed value: ${constants.MIN_CAL_SGV} mg/dL`);
      process.exit(1);
    }
  } else if (command === 'start') {
    sendCmd = 'startSensor';
    sendArg = params.sensor_serial_code;
  } else if (command === 'back-start') {
    sendCmd = 'backStartSensor';
    sendArg = params.sensor_serial_code;
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
      process.exit(1);
    }
  } else if (command === 'id') {
    if (validTxId(params.id)) {
      sendCmd = 'id';
      sendArg = params.id;
    } else {
      console.log(`ERROR: Invalid Transmitter Id: ${params.id}`);
    }
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
      process.exit(1);
    }
  }

  const socket = io('http://localhost:3000/cgm');

  socket.on('connect', () => {
    console.log('Connected');
  });

  socket.on('pending', (pending) => {
    console.log(`          Pending: [ // Messages queued as of ${moment().format()}`);
    for (let i = 0; i < pending.length; i += 1) {
      const record = pending[i];
      record.date = moment(record.date).format();
      console.log('                    ', JSON.stringify(record, null, null), ',');
    }
    console.log('                   ]');
  });

  socket.on('id', (id) => {
    if (validTxId(id)) {
      console.log('   Transmitter ID: ', id);
    } else {
      console.log('   Transmitter ID: ', id, ' <<< ID is invalid and needs to be set');
    }

    if (sendCmd && sendCmd === 'startSensor') {
      // validate command accounting for G5 vs G6 differences
      if ((id.substr(0, 1) === '8') && !sendArg) {
        console.log('\n\nG6 Start Requires Sensor Serial Code\n\n');
        process.exit(1);
      } else if ((id.substr(0, 1) !== '8') && sendArg) {
        console.log('\n\nCommand Had Sensor Serial Code, But No Code Required for G5\n\n');
        process.exit(1);
      }
    }

    if (sendCmd) {
      socket.emit(sendCmd, sendArg);
    }

    // Only send it once
    sendCmd = null;
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
