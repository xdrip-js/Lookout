#!/usr/bin/env node

const LoopIO = require('./loopIO');
const PumpIO = require('./pumpIO');
const storage = require('node-persist');
const storageLock = require('./storageLock');

const argv = require('yargs')
  .usage('$0 [--extend_sensor] [--expired_cal] [--port <port>]')
  .option('extend_sensor', {
    boolean: true,
    describe: 'Enables extended sensor session mode',
    default: false
  })
  .option('expired_cal', {
    boolean: true,
    describe: 'Enables expired calibration mode',
    default: false
  })
  .option('port', {
    nargs: 1,
    describe: 'Port number for web server',
    default: 3000
  })
  .strict(true)
  .help('help');

const params = argv.argv;

let options = {
  extend_sensor: params.extend_sensor,
  expired_cal: params.expired_cal,
  port: params.port
};

const init = async () => {

  // handle persistence here
  // make the storage direction relative to the install directory,
  // not the calling directory
  await storage.init({dir: __dirname + '/storage'});

  const TransmitterIO = argv.sim ? require('./transmitterIO-simulated') : require('./transmitterIO');

  const ClientIO = require('./clientIO');

  const client = ClientIO(options);

  TransmitterIO(options, storage, storageLock, client);

  LoopIO(io.of('/loop'));
  PumpIO(io.of('/pump'));
};

init();

