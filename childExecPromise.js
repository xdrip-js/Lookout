const exec = require('child_process').exec;

module.exports = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (err, stdout, stderr) => {
      if (err) {
        reject({stdout, stderr, err});
      } else {
        resolve({stdout, stderr});
      }
    });
  });
};

