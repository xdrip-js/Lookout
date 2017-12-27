const xDripAPS = require("./xDripAPS")();
const Transmitter = require('xdrip-js');

module.exports = (io) => {
  let id = 'ABCDEF';
  const version = '1.2.3.4';
  const glucose = {
    inSession: true,
    glucose: 120,
    trend: 0,
    readDate: Date.now(),
    state: 6,
    status: 0x83,
    filtered: 120,
    sessionStartDate: Date.now(),
    activationDate: Date.now() - 17*24*60*60*1000
  };
  const glucoseHistory = [
    {readDate: Date.now(), glucose: 100},
    {readDate: Date.now() - 15*60000, glucose: 80}
  ];
  let calibration = {
    date: Date.now() - 12*60*60*1000,
    glucose: 100
  };
  setInterval(() => {
    glucose.glucose += 1;
    glucose.readDate = Date.now();
    glucose.trend += 10;
    if (glucose.trend >= 40) {
      glucose.trend -= 70;
    }
    console.log('trend = ' + glucose.trend);
    io.emit('glucose', glucose);
  }, 60000);

  io.on('connection', (socket) => {
    socket.emit('id', id);
    socket.emit('version', '1.2.3.4');
    socket.emit('glucose', glucose);
    socket.emit('calibration', calibration);
    socket.emit('glucoseHistory', glucoseHistory);

    socket.on('startSensor', () => {
      // transmitter.startSensor();
    });
    socket.on('stopSensor', () => {
    });
    socket.on('calibrate', glucose => {
      console.log('received calibration of ' + glucose);
      // const pending = transmitter.calibrate(glucose);
      // storage.setItemSync('calibration', pending);
      // io.emit('calibration', pending);
    });
    socket.on('id', id => {
      id = id;
      io.emit('id', id);
    });
  });
};
