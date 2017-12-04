// NOTE: an example of how to run in one-shot mode as a
// child process - this will end up in transmitterIO.js

const cp = require('child_process');

function listenToTransmitter() {
  console.log("listening to transmitter")

  var worker = cp.fork('./transmitter-worker', ['40S6R4'], {
    env: {
      DEBUG: 'transmitter,bluetooth-manager'
    }
  });

  worker.on('message', function(m) {
    if (m.cmd == "getMessages") {
      worker.send([]);
    } else if (m.cmd == "glucose"){
      // Receive results from child process
      console.log('received filtered glucose of : ' + m.data.filtered);
    }
  });

  worker.on('exit', function(m) {
    // Receive results from child process
    console.log('exited');
    setTimeout(listenToTransmitter, 60000);
  });
}

listenToTransmitter();
