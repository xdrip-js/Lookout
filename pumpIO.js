const chokidar = require('chokidar');
const fs = require('fs');

module.exports = (io) => {
  let basalProfile;

  const readBasalProfile = (path) => {
    console.log(`Reading file ${path}`);
    fs.readFile(path, 'utf8', function (err, data) {
      if (err) throw err; // we'll not consider error handling for now
      basalProfile = JSON.parse(data);
      io.emit('basalProfile', basalProfile);
    });
  }

  chokidar.watch('myopenaps/settings/basal_profile.json')
  .on('change', readBasalProfile)
  .on('add', readBasalProfile);

  io.on('connection', socket => {
    socket.emit('basalProfile', basalProfile);
    // iob = require('/root/myopenaps/monitor/iob.json');
    // socket.emit('iob', iob[0]['iob']);
  });
};
