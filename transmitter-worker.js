const Transmitter = require('xdrip-js');

const id = process.argv[2];

const getMessages = () => {
  return new Promise((resolve, reject) => {
    process.on('message', messages => {
      resolve(messages);
    });
    // TODO: consider adding a timeout here, with resolve([]), or reject
    process.send({msg: "getMessages"});
  });
};

console.log('kicking off');
const transmitter = new Transmitter(id, getMessages);

transmitter.on('glucose', glucose => {
  process.send({msg: "glucose", data: glucose});
});

transmitter.on('messageProcessed', data => {
  process.send({msg: 'messageProcessed', data});
});

transmitter.on('calibrationData', data => {
  process.send({msg: 'calibrationData', data});
});

transmitter.on('disconnect', process.exit);
