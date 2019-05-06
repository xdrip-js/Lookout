let storage = null;
const Debug = require('debug');

const log = Debug('storage:log'); /* eslint-disable-line no-unused-vars */
const error = Debug('storage:error'); /* eslint-disable-line no-unused-vars */
const debug = Debug('storage:debug'); /* eslint-disable-line no-unused-vars */

const storageLock = require('./storageLock');

const getItem = async (name) => {
  if (!storage) {
    throw Error('Storage not initialized');
  }

  try {
    return storage.getItem(name);
  } catch (e) {
    error(`Unable to read item ${name}:`, e);
    return null;
  }
};

const getArray = async (name) => {
  let arrayVal = await getItem(name);

  if (!arrayVal) {
    arrayVal = [];
  }

  return arrayVal;
};

const setItem = async (name, value) => {
  if (!storage) {
    throw Error('Storage not initialized');
  }

  return storage.setItem(name, value);
};

const setItemSync = (name, value) => {
  if (!storage) {
    throw Error('Storage not initialized');
  }

  return storage.setItemSync(name, value);
};

const delItem = async (name) => {
  if (storage) {
    return storage.del(name);
  }

  throw Error('Storage not initialized');
};

module.exports = {
  init: (newStorage) => {
    storage = newStorage;
  },

  getItem: async name => getItem(name),

  getArray: async name => getArray(name),

  setItem: async (name, value) => setItem(name, value),

  setItemSync: (name, value) => setItemSync(name, value),

  delItem: async name => delItem(name),

  lock: async () => storageLock.lockStorage(),

  unlock: () => storageLock.unlockStorage(),
};
