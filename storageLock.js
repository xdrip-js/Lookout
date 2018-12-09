

const Debug = require('debug');

/* eslint-disable-next-line no-unused-vars */
const log = Debug('storageLock:log');
const error = Debug('storageLock:error');
const debug = Debug('storageLock:debug');

module.exports = {};
const storageLockExports = module.exports;

let StorageLocked = false;

const timeout = async ms => new Promise(resolve => setTimeout(resolve, ms));

storageLockExports.lockStorage = async () => {
  let count = 0;

  // sleep for 1 second at a time until
  // the storage is unlocked
  while (StorageLocked) {
    count += 1;

    if (count > 5) {
      error('Storage locked... waiting 1 second');
    }

    /* eslint-disable-next-line no-await-in-loop */
    await timeout(1000);
  }

  debug('Storage locked.');
  StorageLocked = true;
};

storageLockExports.unlockStorage = () => {
  debug('Storage unlocked.');
  StorageLocked = false;
};
