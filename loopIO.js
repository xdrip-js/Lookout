module.exports = (io) => {
  // TODO: use namespaces (cgm, loop, pump) to logically separate msgs
  io.on('connection', socket => {
    iob = require('/root/myopenaps/monitor/iob.json');
    socket.emit('iob', iob[0]['iob']);
  });
};
