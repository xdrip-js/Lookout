
const commandExists = require('command-exists');
const exec = require('./childExecPromis');

let storage = null;

const offline = async () => {
  return false;
};

const _getMeterId = async () => {
  let meterId = await storage.getItem('meterid')
    .catch(error => {
      console.log('Unable to get meterid storage item: ' + error);
    });

  if (!meterId) {
    meterId = '000000';
    storage.setItem('meterid', meterId)
      .catch(error => {
        console.log('Unable to store meterid storage item: ' + error);
      });
  }

  return meterId;
};

// Create a Lookout GUI HTTP server
module.exports = (options, _storage, client) => {
  let fakemeterInstalled = false;

  storage = _storage;

  // Create an object that can be used
  // to interact with the transmitter.
  const fakeMeter = {
    // provide the current transmitter ID
    getMeterId: _getMeterId,

    // Set the meter Id to the value provided
    setMeterId: (value) => {
      storage.setItem('meterid', value)
        .catch(error => {
          console.log('Error saving meterid: ' + error);
        });

      client.meterId(value);
    },

    // Send glucose to fakemeter
    glucose: async (value) => {
      console.log('Sending glucose to fakemeter: ', value);

      let meterId = await _getMeterId();

      if (fakemeterInstalled && (options.fakemeter || (await offline() && options.offline_fakemeter))) {
        let { stdout, stderr } = await exec('lookout_fakemeter '+meterId+' '+value+' '+options.openaps)
          .catch( (err) => {
            console.log('Unable to send glucose to fakemeter: ' + err.err);
            stdout = err.stdout;
            stderr = err.stderr;
          });

        console.log(`stdout: ${stdout}`);
        console.log(`stderr: ${stderr}`);
      }
    }
  };

  commandExists('fakemeter')
    .then( (command) => {
      fakemeterInstalled = true;
      console.log(command + ' not installed');
    })
    .catch( () => {
      console.log('fakemeter not installed');
    });

  // Provide the object to the client
  client.setFakeMeter(fakeMeter);

  return fakeMeter;
};

