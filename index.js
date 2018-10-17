#!/usr/bin/env node

const storage = require('node-persist');
const storageLock = require('./storageLock');

const argv = require('yargs')
  .usage('$0 [--extend_sensor] [--expired_cal] [--port <port>] [--openaps <directory>] [--sim]')
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
  .option('sim', {
    boolean: true,
    describe: 'Enable simulation mode',
    default: false
  })
  .option('port', {
    nargs: 1,
    describe: 'Port number for web server',
    default: 3000
  })
  .option('openaps', {
    nargs: 1,
    describe: 'OpenAPS directory',
    default: '/root/myopenaps'
  })
  .wrap(null)
  .strict(true)
  .help('help');

const params = argv.argv;

let options = {
  extend_sensor: params.extend_sensor,
  expired_cal: params.expired_cal,
  port: params.port,
  sim: params.sim,
  openaps: params.openaps
};

const init = async (options) => {

  // handle persistence here
  // make the storage direction relative to the install directory,
  // not the calling directory
  await storage.init({dir: __dirname + '/storage'});

  const TransmitterIO = options.sim ? require('./transmitterIO-simulated') : require('./transmitterIO');

  const ClientIO = require('./clientIO');

  const syncNS = require('./syncNS');

  // Start the web GUI server
  const client = ClientIO(options);

  const fakeMeter = require('./fakemeter')(storage, client);

  // Start the transmitter loop task
  TransmitterIO(options, storage, storageLock, client, fakeMeter);

  // Start the Nightscout synchronization loop task
  syncNS(storage, storageLock, options.expired_cal);
};

init(options);

