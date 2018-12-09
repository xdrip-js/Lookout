const { exec } = require('child_process');

module.exports = command => new Promise((resolve, reject) => {
  exec(command, (err, stdout, stderr) => {
    if (err) {
      reject(new Error({ stdout, stderr, err }));
    } else {
      resolve({ stdout, stderr });
    }
  });
});
