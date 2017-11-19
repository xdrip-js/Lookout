const chokidar = require('chokidar');
const fs = require('fs');

module.exports = (io) => {
  const openapsDir = '/root/myopenaps';

  let iob;
  let enacted;

  const readIOB = (path) => {
    console.log(`Reading file ${path}`);
    fs.readFile(path, 'utf8', function (err, data) {
      if (err) throw err; // we'll not consider error handling for now
      const obj = JSON.parse(data);
      iob = obj[0]['iob'];
      io.emit('iob', iob);
    });
  }
  chokidar.watch(openapsDir + '/iob.json')
  .on('change', readIOB)
  .on('add', readIOB);

  const readEnacted = (path) => {
    console.log(`Reading file ${path}`);
    fs.readFile(path, 'utf8', function (err, data) {
      if (err) throw err; // we'll not consider error handling for now
      enacted = (({
        timestamp,
        rate,
        duration,
        units
      }) => ({
        date: new Date(timestamp).getTime(),
        rate,
        duration,
        units
      }))(JSON.parse(data));
      console.log(enacted);
      io.emit('enacted', enacted);
    });
  }
  chokidar.watch(openapsDir + '/enact/enacted.json')
  .on('change', readEnacted)
  .on('add', readEnacted);

  io.on('connection', socket => {
    socket.emit('iob', iob);
    socket.emit('enacted', enacted);
    // iob = require('/root/myopenaps/monitor/iob.json');
    // socket.emit('iob', iob[0]['iob']);
  });
};
