let storage = null;
const storageLock = require('./storageLock');


const getItem = async (name) => {
  if (!storage) {
    throw Error('Storage not initialized');
  }

  return storage.getItem(name);
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

  delItem: async name => delItem(name),

  lock: async () => storageLock.lockStorage(),

  unlock: () => storageLock.unlockStorage(),
};
