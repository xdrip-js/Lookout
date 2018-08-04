'use strict';

const xDripAPS = require('./xDripAPS')();
const storage = require('node-persist');
const moment = require('moment');
const timeLimitedPromise = require('./timeLimitedPromise');
const storageLock = require('./storageLock');

var _ = require('lodash');

const syncCal = async (sensorInsert) => {
  let rigCal = null;
  let NSCal = null;
  let nsQueryError = false;

  NSCal = await xDripAPS.latestCal()
    .catch(error => {
      console.log('Error getting NS calibration: ' + error);
      nsQueryError = true;
      return;
    });

  if (nsQueryError) {
    return;
  }

  if (NSCal) {
    console.log('SyncNS NS Cal - date: ' + moment(NSCal.date).format() + ' slope: ' + Math.round(NSCal.slope*100)/100 + ' intercept: ' + Math.round(NSCal.intercept*10)/10);
  }

  await storageLock.lockStorage();

  rigCal = await storage.getItem('g5Calibration')
    .catch(error => {
      console.log('Error getting rig calibration: ' + error);
    });

  if (rigCal) {
    console.log('SyncNS Rig Cal - date: ' + moment(rigCal.date).format() + ' slope: ' + Math.round(rigCal.slope*100)/100 + ' intercept: ' + Math.round(rigCal.intercept*10)/10);
  }

  if (NSCal) {
    if (!rigCal) {
      console.log('No rig calibration, storing NS calibration');

      if (sensorInsert.diff(moment(NSCal.date)) > 0) {
        console.log('Found sensor insert after latest NS calibration. Not updating local rig calibration');
      } else {
        await storage.setItem('g5Calibration', NSCal)
          .catch(() => {
            console.log('Unable to store NS Calibration');
          });
      }
    } else if (rigCal.date < NSCal.date) {
      console.log('NS calibration more recent than rig calibration NS Cal Date: ' + NSCal.date + ' Rig Cal Date: ' + rigCal.date);

      storage.setItem('g5Calibration', NSCal)
        .catch(() => {
          console.log('Unable to store NS Calibration');
        });
    } else if (rigCal.date > NSCal.date) {
      console.log('Rig calibration more recent than NS calibration NS Cal Date: ' + NSCal.date + ' Rig Cal Date: ' + rigCal.date);
      console.log('Upoading rig calibration');

      xDripAPS.postCalibration(rigCal);
    } else {
      console.log('Rig and NS calibration dates match - no sync needed');
    }
  } else {
    if (rigCal) {
      console.log('No NS calibration - uploading rig calibration');
      xDripAPS.postCalibration(rigCal);
    } else {
      console.log('No rig or NS calibration');
    }
  }

  storageLock.unlockStorage();

  console.log('syncCal complete');
};

const syncSGVs = async () => {
  let timeSince = null;

  let rigSGVs = null;
  let nsSGVs = null;
  let nsQueryError = false;

  timeSince = moment().subtract(24, 'hours');

  nsSGVs = await xDripAPS.SGVsSince(timeSince, 12*24*3)
    .catch(error => {
      console.log('Error getting NS SGVs: ' + error);
      nsQueryError = true;
      return;
    });

  if (nsQueryError) {
    return;
  }

  if (!nsSGVs) {
    nsSGVs = [];
  }

  console.log('SyncNS NS SGVs: ' + nsSGVs.length);

  nsSGVs = _.sortBy(nsSGVs, ['date']);

  if (nsSGVs.length > 0) {
    let sgv = nsSGVs[nsSGVs.length-1];
    console.log('Most recent NS SGV - date: ' + moment(sgv.date).format() + ' sgv: ' + sgv.sgv + ' unfiltered: ' + sgv.unfiltered);
  }

  await storageLock.lockStorage();

  rigSGVs = await storage.getItem('glucoseHist')
    .catch(error => {
      console.log('Error getting rig SGVs: ' + error);
    });

  if (!rigSGVs) {
    rigSGVs = [];
  }

  let minDate = moment().subtract(24, 'hours').valueOf();
  let sliceStart = 0;

  // only review the last 24 hours of glucose
  for (let i=0; i < rigSGVs.length; ++i) {
    if (rigSGVs[i].readDateMills < minDate) {
      sliceStart = i+1;
    }
  }

  rigSGVs = rigSGVs.slice(sliceStart);

  console.log('SyncNS Rig SGVs: ' + rigSGVs.length);

  // we can assume the rigSGVs are sorted since we sort before
  // storing them

  let rigSGVsLength = rigSGVs.length;
  let rigIndex = 0;

  if (rigSGVsLength > 0) {
    let sgv = rigSGVs[rigSGVsLength-1];
    console.log('Most recent rig SGV - date: ' + moment(sgv.readDate).format() + ' sgv: ' + sgv.glucose + ' unfiltered: ' + sgv.unfiltered);
  }

  for (let nsIndex = 0; nsIndex < nsSGVs.length; ++nsIndex) {
    let nsSGV = nsSGVs[nsIndex];
    let rigSGV = null;

    for (; rigIndex < rigSGVsLength; ++rigIndex) {
      let timeDiff = moment(nsSGV.date).valueOf() - rigSGVs[rigIndex].readDateMills;

      if (Math.abs(timeDiff) < 60*1000) {
        rigSGV = rigSGVs[rigIndex];
        break;
      } else if (timeDiff < 0) {
        // bail when rig value is later in time than NS value
        break;
      }
    }

    if (!rigSGV) {
      rigSGV = {
        'readDate': nsSGV.dateString,
        'readDateMills': moment(nsSGV.date).valueOf(),
        'filtered': nsSGV.filtered,
        'unfiltered': nsSGV.unfiltered,
        'glucose': nsSGV.sgv,
        'nsNoise': nsSGV.noise,
        'trend': nsSGV.trend,
        'state': 0x00, // Set state to None
        'g5calibrated': false
      };

      rigSGVs.push(rigSGV);
    }
  }

  rigSGVs = _.sortBy(rigSGVs, ['readDateMills']);

  await storage.setItem('glucoseHist', rigSGVs)
    .catch((err) => {
      console.log('Unable to store glucoseHist: ' + err);
    });

  storageLock.unlockStorage();

  let nsIndex = 0;

  for (let rigIndex = 0; rigIndex < rigSGVs.length; ++rigIndex) {
    let rigSGV = rigSGVs[rigIndex];
    let nsSGV = null;

    if (!rigSGV.glucose) {
      // Do not attempt to send an invalid glucose to NS
      continue;
    }

    for (; nsIndex < nsSGVs.length; ++nsIndex) {
      let timeDiff = moment(nsSGVs[nsIndex].date) - rigSGV.readDateMills;

      if (Math.abs(timeDiff) < 60*1000) {
        nsSGV = nsSGVs[nsIndex];
        break;
      } else if (timeDiff > 0) {
        // Bail when NS value is later in time than rig value
        break;
      }
    }

    if (!nsSGV) {
      xDripAPS.post(rigSGV, false);
    }
  }

  console.log('syncSGVs complete');
};

const syncBGChecks = async (sensorInsert) => {
  let NSBGChecks = null;
  let nsQueryError = false;

  NSBGChecks = await xDripAPS.BGChecksSince(sensorInsert)
    .catch(error => {
      // Bail out since we can't sync if we don't have NS access
      console.log('Error getting NS BG Checks: ' + error);
      nsQueryError = true;
      return;
    });

  if (nsQueryError) {
    return;
  }

  if (!NSBGChecks) {
    NSBGChecks = [];
  }

  console.log('SyncNS NS BG Checks: ' + NSBGChecks.length);

  for (let nsIndex = 0; nsIndex < NSBGChecks.length; ++nsIndex) {
    NSBGChecks[nsIndex].created_at = moment(NSBGChecks[nsIndex].created_at).format();
  }

  NSBGChecks = _.sortBy(NSBGChecks, ['created_at']);

  if (NSBGChecks.length > 0) {
    let bgCheck = NSBGChecks[NSBGChecks.length-1];
    console.log('Most recent NS BG Check - date: ' + moment(bgCheck.create_at).format() + ' type: ' + bgCheck.glucoseType + ' glucose: ' + bgCheck.glucose);
  }

  await storageLock.lockStorage();

  let rigBGChecks = await storage.getItem('bgChecks')
    .catch(error => {
      console.log('Error getting bgChecks: ' + error);
    });

  if (!rigBGChecks || !Array.isArray(rigBGChecks)) {
    rigBGChecks = [];
  }

  let rigDataLength = rigBGChecks.length;
  let rigIndex = 0;

  if (rigDataLength > 0) {
    let bgCheck = rigBGChecks[rigDataLength-1];
    console.log('Most recent Rig BG Check - date: ' + moment(bgCheck.date).format() + ' glucose: ' + bgCheck.glucose + ' unfiltered: ' + bgCheck.unfiltered);
  }

  for (let nsIndex = 0; nsIndex < NSBGChecks.length; ++nsIndex) {
    let nsValue = NSBGChecks[nsIndex];
    let rigValue = null;

    for (; rigIndex < rigDataLength; ++rigIndex) {
      let timeDiff = moment(nsValue.created_at).diff(moment(rigBGChecks[rigIndex].date));

      if (Math.abs(timeDiff) < 60*1000) {
        rigValue = rigBGChecks[rigIndex];
        break;
      } else if (timeDiff < 0) {
        // Bail if rigBGChecks time is later than NS BG time
        break;
      }
    }

    if (!rigValue) {
      rigValue = {
        'date': moment(nsValue.created_at).valueOf(),
        'glucose': nsValue.glucose,
        'type': 'NS'
      };

      rigBGChecks.push(rigValue);
    }
  }

  rigBGChecks = _.sortBy(rigBGChecks, ['date']);

  let sliceStart = 0;

  // Remove any cal data we have
  // that predates the last sensor insert
  for (let i=0; i < rigBGChecks.length; ++i) {
    if (moment(rigBGChecks[i].date).diff(sensorInsert) < 0) {
      sliceStart = i+1;
    }
  }

  rigBGChecks = rigBGChecks.slice(sliceStart);

  // Add unfiltered values if any are missing
  for (let i=0; i < rigBGChecks.length; ++i) {
    let rigValue = rigBGChecks[i];

    if (!('unfiltered' in rigValue) || !rigValue.unfiltered) {
      let NSSGVs = null;
      let valueTime = moment(rigValue.date);
      let timeStart = moment(rigValue.date).subtract(6, 'minutes');
      let timeEnd = moment(rigValue.date).add(6, 'minutes');

      // Get NS SGV immediately before BG Check
      NSSGVs = await xDripAPS.SGVsBetween(timeStart, timeEnd, 5)
        .catch(error => {
          console.log('Unable to get NS SGVs to match unfiltered with BG Check: ' + error);
        });

      if (!NSSGVs) {
        NSSGVs = [];
      }

      for (let i=0; i < NSSGVs.length; ++i) {
        if (Math.abs(moment(NSSGVs[i].date).diff(valueTime)) < 5*60*1000) {
          rigValue.unfiltered = NSSGVs[i].unfiltered;
          console.log('Adding unfiltered value to BGCheck at ' + valueTime.utc().format() + ': id = ' + NSSGVs[i]._id + ' time = ' + NSSGVs[i].date);
          break;
        }
      }
    }
  }

  await storage.setItem('bgChecks', rigBGChecks)
    .catch((err) => {
      console.log('Unable to store bgChecks: ' + err);
    });

  storageLock.unlockStorage();

  let nsIndex = 0;

  for (let rigIndex = 0; rigIndex < rigBGChecks.length; ++rigIndex) {
    let rigValue = rigBGChecks[rigIndex];
    let nsValue = null;
 
    for (; nsIndex < NSBGChecks.length; ++nsIndex) {
      let timeDiff = moment(NSBGChecks[nsIndex].created_at).diff(moment(rigValue.date));

      if (Math.abs(timeDiff) < 60*1000) {
        nsValue = NSBGChecks[nsIndex];
        break;
      } else if (timeDiff > 0) {
        // bail out if NS BG Check is later in time than rig value
        break;
      }
    }

    if (!nsValue) {
      xDripAPS.postBGCheck(rigValue);
    }
  }

  console.log('syncBGChecks complete');
};

const syncNS = async () => {
  let sensorInsert = null;
  let nsQueryError = false;

  sensorInsert = await xDripAPS.latestSensorInserted()
    .catch(error => {
      console.log('Unable to get latest sensor inserted record from NS: ' + error);
      nsQueryError = true;
      return;
    });

  if (!sensorInsert) {
    console.log('No sensor inserted record returned from NS');
  }

  if (nsQueryError || !sensorInsert) {
    console.log('syncNS - Setting 5 minute timer to try again');

    setTimeout(() => {
      // Restart the syncNS after 5 minute
      syncNS();
    }, 5 * 60000);

    return;
  }

  // For each of these, we catch any errors and then
  // call resolve so the Promise.all works as it
  // should and doesn't trigger early because of an error
  var syncCalPromise = new timeLimitedPromise(4*60*1000, async (resolve) => {
    await syncCal(sensorInsert);
    resolve();
  });

  let syncSGVsPromise = new timeLimitedPromise(4*60*1000, async (resolve) => {
    await syncSGVs();
    resolve();
  });

  let syncBGChecksPromise = new timeLimitedPromise(4*60*1000, async (resolve) => {
    await syncBGChecks(sensorInsert);
    resolve();
  });

  Promise.all([syncCalPromise, syncSGVsPromise, syncBGChecksPromise])
    .catch(error => {
      console.log('syncNS error: ' + error);
    }).then( () => {
      console.log('syncNS complete - setting 5 minute timer');

      setTimeout(() => {
        // Restart the syncNS after 5 minute
        syncNS();
      }, 5 * 60000);
    });
};

module.exports = syncNS;
