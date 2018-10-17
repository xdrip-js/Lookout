
// Create a Lookout GUI HTTP server
module.exports = (storage, client) => {

  // Create an object that can be used
  // to interact with the transmitter.
  const fakeMeter = {
    // provide the current transmitter ID
    getMeterId: async () => {
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
    },

    // Set the meter Id to the value provided
    setMeterId: (value) => {
      storage.setItem('meterid', value)
        .catch(error => {
          console.log('Error saving meterid: ' + error);
        });

      client.meterId(value);
    },

    // Send glucose to fakemeter
    glucose: (value) => {
      console.log('Sending glucose to fakemeter: ', value);
    }
  };

  // Provide the object to the client
  client.setFakeMeter(fakeMeter);
};

