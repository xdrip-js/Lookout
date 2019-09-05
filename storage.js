let storage = null;
const Debug = require('debug');
const moment = require('moment');

const log = Debug('storage:log'); /* eslint-disable-line no-unused-vars */
const error = Debug('storage:error'); /* eslint-disable-line no-unused-vars */
const debug = Debug('storage:debug'); /* eslint-disable-line no-unused-vars */

const storageLock = require('./storageLock');

const getEvent = async (name) => {
  if (!storage) {
    throw Error('Storage not initialized');
  }

  try {
    const item = storage.getItem(name);
    item.date = moment(item.date);
    return item;
  } catch (e) {
    error(`Unable to read item ${name}:`, e);
    return null;
  }
};

const setEvent = async (name, value) => {
  if (!storage) {
    throw Error('Storage not initialized');
  }

  const saveValue = {
    date: value.date.valueOf(),
    notes: value.notes,
  };

  return storage.setItem(name, saveValue);
};

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

  getEvent: async name => getEvent(name),

  getArray: async name => getArray(name),

  setItem: async (name, value) => setItem(name, value),

  setEvent: async (name, value) => setEvent(name, value),

  setItemSync: (name, value) => setItemSync(name, value),

  delItem: async name => delItem(name),

  lock: async () => storageLock.lockStorage(),

  unlock: () => storageLock.unlockStorage(),
};
