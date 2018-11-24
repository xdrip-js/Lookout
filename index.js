#!/usr/bin/env node

const storage = require('node-persist');
const storageLock = require('./storageLock');

const Debug = require('debug');

const argv = require('yargs')
  .usage('$0 [--extend_sensor] [--expired_cal] [--port <port>] [--openaps <directory>] [--sim] [--fakemeter] [--offline_fakemeter] [--no_nightscout]')
  .option('extend_sensor', {
    boolean: true,
    describe: 'Enables extended sensor session mode',
    alias: 'e',
    default: false
  })
  .option('expired_cal', {
    boolean: true,
    describe: 'Enables expired calibration mode',
    alias: 'x',
    default: false
  })
  .option('verbose', {
    boolean: true,
    describe: 'Enables verbose mode',
    alias: 'v',
    default: false
  })
  .option('sim', {
    boolean: true,
    describe: 'Enable simulation mode',
    alias: 's',
    default: false
  })
  .option('fakemeter', {
    boolean: true,
    describe: 'Enable fakemeter',
    alias: 'f',
    default: false
  })
  .option('offline_fakemeter', {
    boolean: true,
    describe: 'Enable fakemeter only when offline',
    alias: 'o',
    default: false
  })
  .option('port', {
    nargs: 1,
    describe: 'Port number for web server',
    alias: 'p',
    default: 3000
  })
  .option('openaps', {
    nargs: 1,
    describe: 'OpenAPS directory',
    alias: 'd',
    default: '/root/myopenaps'
  })
  .option('no_nightscout', {
    boolean: true,
    describe: 'Disable Nightscout interaction',
    alias: 'n',
    default: false
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
  openaps: params.openaps,
  fakemeter: params.fakemeter,
  offline_fakemeter: params.offline_fakemeter,
  verbose: params.verbose,
  nightscout: !params.no_nightscout
};

const init = async (options) => {

  if (options.verbose) {
    Debug.enable('lookout:*');
  } else {
    Debug.enable('lookout:*,-lookout:debug');
  }

  // handle persistence here
  // make the storage direction relative to the install directory,
  // not the calling directory
  await storage.init({dir: __dirname + '/storage'});

  const TransmitterIO = require('./transmitterIO');

  const ClientIO = require('./clientIO');

  // Start the web GUI server
  const client = ClientIO(options);

  const fakeMeter = require('./fakemeter')(options, storage, client);

  // Start the transmitter loop task
  let transmitter = await TransmitterIO(options, storage, storageLock, client, fakeMeter);

  // Start the Nightscout synchronization loop task
  options.nightscout && require('./syncNS')(storage, storageLock, transmitter);
};

init(options);

