'use strict';

const Debug = require('debug');

/*eslint-disable-next-line no-unused-vars*/
const log = Debug('storageLock:log');
const error = Debug('storageLock:error');
const debug = Debug('storageLock:debug');

var exports = module.exports = {};

let StorageLocked = false;

const timeout = async (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

exports.lockStorage = async () => {
  let count = 0;

  // sleep for 1 second at a time until
  // the storage is unlocked
  while (StorageLocked) {
    count += 1;

    if (count > 5) {
      error('Storage locked... waiting 1 second');
    }

    await timeout(1000);
  }

  debug('Storage locked.');
  StorageLocked = true;
};

exports.unlockStorage = () => {
  debug('Storage unlocked.');
  StorageLocked = false;
};

