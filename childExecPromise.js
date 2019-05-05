const { exec } = require('child_process');

module.exports = command => new Promise((resolve, reject) => {
  exec(command, (err, stdout, stderr) => {
    if (err) {
      const errObj = new Error(`Unable to execute command: "${command}"`);
      errObj.stdout = stdout;
      errObj.stderr = stderr;

      reject(errObj);
    } else {
      resolve({ stdout, stderr });
    }
  });
});
