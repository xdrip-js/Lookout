'use strict';

var exports = module.exports = {};

let StorageLocked = false;

const timeout = async (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

exports.lockStorage = async () => {
  // sleep for 1 second at a time until
  // the storage is unlocked
  while (StorageLocked) {
    console.log('Storage locked... waiting 1 second');
    await timeout(1000);
  }

  console.log('Storage locked.');
  StorageLocked = true;
};

exports.unlockStorage = () => {
  console.log('Storage unlocked.');
  StorageLocked = false;
};

