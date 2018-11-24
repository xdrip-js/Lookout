
const exec = require('./childExecPromise');

const Debug = require('debug');
const log = Debug('fakemeter:log');
const error = Debug('fakemeter:error');
const debug = Debug('fakemeter:debug');

let storage = null;
let options = null;
let online = false;

const test_online = async () => {
  let status = true;
  let stdout = null;
  let stderr = null;

  let retVal = await exec('lookout_online')
    .catch( (err) => {
      error('Online test failed with error: ' + err.err);
      stdout = err.stdout;
      stderr = err.stderr;
      status = false;
    });

  // replace it if we got a return value. If we didn't, we likely caught an error
  stdout = retVal && retVal.stdout || stdout;
  stderr = retVal && retVal.stderr || stderr;

  debug(`lookout_online stdout: ${stdout}`);
  debug(`lookout_online stderr: ${stderr}`);

  return status;
};

const _getMeterId = async () => {
  let meterId = await storage.getItem('meterid')
    .catch(error => {
      error('Unable to get meterid storage item: ' + error);
    });

  if (!meterId) {
    meterId = '000000';
    storage.setItem('meterid', meterId)
      .catch(error => {
        error('Unable to store meterid storage item: ' + error);
      });
  }

  return meterId;
};

// Create a Lookout GUI HTTP server
module.exports = (_options, _storage, client) => {
  storage = _storage;
  options = _options;

  // Create an object that can be used
  // to interact with the transmitter.
  const fakeMeter = {
    // provide the current transmitter ID
    getMeterId: _getMeterId,

    // Set the meter Id to the value provided
    setMeterId: (value) => {
      storage.setItem('meterid', value)
        .catch(error => {
          error('Error saving meterid: ' + error);
        });

      client.meterId(value);
    },

    // Send glucose to fakemeter
    glucose: async (value) => {
      // trigger online status update. It lags by 1 glucose reading, but
      // doesn't waste time waiting for response from Internet
      test_online().then( (value) => {
        online = value;
      });

      let meterId = await _getMeterId();

      if (options.fakemeter || (!online && options.offline_fakemeter)) {
        log('Sending glucose to fakemeter: ', value);

        let stdout = null;
        let stderr = null;

        let retVal = await exec('lookout_fakemeter '+meterId+' '+value+' '+options.openaps)
          .catch( (err) => {
            error('Unable to send glucose to fakemeter: ' + err.err);
            stdout = err.stdout;
            stderr = err.stderr;
          });

        // replace it if we got a return value. If we didn't, we likely caught an error
        stdout = retVal && retVal.stdout || stdout;
        stderr = retVal && retVal.stderr || stderr;

        debug(`fakemeter stdout: ${stdout}`);
        debug(`fakemeter stderr: ${stderr}`);
      } else if (online && options.offline_fakemeter) {
        log('Not sending glucose to fakemeter because rig is online');
      }
    }
  };

  // Provide the object to the client
  client.setFakeMeter(fakeMeter);

  return fakeMeter;
};

