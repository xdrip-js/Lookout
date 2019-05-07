#!/usr/bin/env node

const store = require('node-persist');

const Debug = require('debug');

const log = Debug('Lookout:log');

const yargs = require('yargs');
const storage = require('./storage');
const syncNS = require('./syncNS');
const FakeMeter = require('./fakemeter');
const TransmitterIO = require('./transmitterIO');
const ClientIO = require('./clientIO');

const argv = yargs
  .usage('$0 [--extend_sensor] [--expired_cal] [--port <port>] [--openaps <directory>] [--sim] [--fakemeter] [--offline_fakemeter] [--no_nightscout] [--include_mode')
  .option('extend_sensor', {
    boolean: true,
    describe: 'Enables extended sensor session mode',
    alias: 'e',
    default: false,
  })
  .option('expired_cal', {
    boolean: true,
    describe: 'Enables expired calibration mode',
    alias: 'x',
    default: false,
  })
  .option('verbose', {
    count: true,
    describe: 'Enables verbose mode',
    alias: 'v',
    default: 0,
  })
  .option('sim', {
    boolean: true,
    describe: 'Enable simulation mode',
    alias: 's',
    default: false,
  })
  .option('fakemeter', {
    boolean: true,
    describe: 'Enable fakemeter',
    alias: 'f',
    default: false,
  })
  .option('offline_fakemeter', {
    boolean: true,
    describe: 'Enable fakemeter only when offline',
    alias: 'o',
    default: false,
  })
  .option('port', {
    nargs: 1,
    describe: 'Port number for web server',
    alias: 'p',
    default: 3000,
  })
  .option('hci', {
    nargs: 1,
    describe: 'Bluetooth adapter to use',
    alias: 'h',
    default: 0,
  })
  .option('openaps', {
    nargs: 1,
    describe: 'OpenAPS directory',
    alias: 'd',
    default: '/root/myopenaps',
  })
  .option('no_nightscout', {
    boolean: true,
    describe: 'Disable Nightscout interaction',
    alias: 'n',
    default: false,
  })
  .option('min_lsr_pairs', {
    nargs: 1,
    describe: 'Minimum number of pairs required for LSR calibration',
    alias: 'l',
    default: 0,
  })
  .option('max_lsr_pairs', {
    nargs: 1,
    describe: 'Maximum number of pairs allowed for LSR calibration',
    alias: 'm',
    default: 0,
  })
  .option('max_lsr_pairs_age', {
    nargs: 1,
    describe: 'Maximum age of pairs relative to latest pair allowed for LSR calibration',
    alias: 'a',
    default: 0,
  })
  .option('include_mode', {
    boolean: true,
    describe: 'Include mode in short state string',
    alias: 'i',
    default: false,
  })
  .wrap(null)
  .strict(true)
  .help('help');

const params = argv.argv;

const options = {
  extend_sensor: params.extend_sensor,
  expired_cal: params.expired_cal,
  port: params.port,
  sim: params.sim,
  openaps: params.openaps,
  fakemeter: params.fakemeter,
  offline_fakemeter: params.offline_fakemeter,
  verbose: params.verbose,
  nightscout: !params.no_nightscout,
  min_lsr_pairs: params.min_lsr_pairs,
  max_lsr_pairs: params.max_lsr_pairs,
  max_lsr_pairs_age: params.max_lsr_pairs_age,
  include_mode: params.include_mode,
  hci: params.hci,
};

const init = async () => {
  let lookoutDebug = 'calcStats:*,calibration:*,clientIO:*,fakemeter:*,loopIO:*';
  lookoutDebug += ',pumpIO:*,storageLock:*,syncNS:*,transmitterIO:*,transmitterWorker:*';
  lookoutDebug += ',xDripAPS:*,transmitter,smp,bluetooth-manager';

  // Disable hangup signal so we don't terminate unexpectedly
  process.on('SIGHUP', (signal) => {
    log(`Received SIGHUP signal: ${signal}`);
  });

  // DEBUG environment variable takes precedence over verbose flag
  if (typeof process.env.DEBUG === 'undefined') {
    if (options.verbose === 0) {
      Debug.enable(`${lookoutDebug},-*:debug`);
    } else if (options.verbose === 1) {
      Debug.enable(lookoutDebug);
    } else if (options.verbose === 2) {
      Debug.enable(`${lookoutDebug},signaling,bindings,acl-att-stream,att,gap`);
    } else {
      Debug.enable('*,*:*');
    }
  }

  // Set which device for noble to use
  process.env.NOBLE_HCI_DEVICE_ID = params.hci;

  // handle persistence here
  // make the storage direction relative to the install directory,
  // not the calling directory
  await store.init({ dir: `${__dirname}/storage`, forgiveParseErrors: false });

  storage.init(store);

  // Start the web GUI server
  const client = ClientIO(options);

  const fakeMeter = FakeMeter(options, storage, client);

  // Start the transmitter loop task
  const transmitter = await TransmitterIO(options, storage, client, fakeMeter);

  // Start the Nightscout synchronization loop task
  if (options.nightscout) {
    syncNS(storage, transmitter);
  }
};

init();
