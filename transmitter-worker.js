const Transmitter = require('xdrip-js');

const id = process.argv[2];
let running = false;

process.on('message', messages => {
  if (running) return;
  running = true;
  console.log('kicking off with messages ' + messages);

  const transmitter = new Transmitter(id);

  // NOTE: we want to be able to call Transmitter like this:
  // const transmitter = new Transmitter(id, messages);

  transmitter.on('glucose', glucose => {
    process.send(glucose);
  });

  transmitter.on('disconnect', process.exit);
});
