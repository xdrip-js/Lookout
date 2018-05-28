'use strict';

class TimeLimitedPromise extends Promise {
  constructor(ms, callback) {
    // We need to support being called with no milliseconds
    // value, because the various Promise methods (`then` and
    // such) correctly call the subclass constructor when
    // building the new promises they return.
    // This code to do it is ugly, could use some love, but it
    // gives you the idea.
    let haveTimeout = typeof ms === 'number' && typeof callback === 'function';
    let init = haveTimeout ? callback : ms;
    super((resolve, reject) => {
      init(resolve, reject);
      if (haveTimeout) {
        setTimeout(() => {
          reject('Timed out');
        }, ms);
      }
    });
  }
}

module.exports = TimeLimitedPromise;

