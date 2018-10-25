'use strict';

const xDripAPS = require('./xDripAPS')();
const moment = require('moment');
const timeLimitedPromise = require('./timeLimitedPromise');
const calibration = require('./calibration');

var _ = require('lodash');

var storage = null;
var storageLock = null;

const syncCal = async (sensorInsert, expiredCal) => {
  let rigCal = null;
  let NSCal = null;
  let nsQueryError = false;
  let rigCalStr = null;

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

  if (expiredCal) {
    rigCalStr = 'expiredCal';
    console.log('Expired calibration use disabled - synchronized g5 calibration with NS');
    rigCalStr = 'g5Calibration';
  } else {
    rigCalStr = 'g5Calibration';
  }

  rigCal = await storage.getItem(rigCalStr)
    .catch(error => {
      console.log('Error getting rig calibration: ' + error);
    });

  if (rigCal) {
    console.log('SyncNS Rig Cal - date: ' + moment(rigCal.date).format() + ' slope: ' + Math.round(rigCal.slope*100)/100 + ' intercept: ' + Math.round(rigCal.intercept*10)/10);
  }

  if (NSCal) {
    // don't use NS cal if in expiredCal mode
    if (!rigCal && (rigCalStr !== 'expiredCal')) {
      console.log('No rig calibration, storing NS calibration');

      if (sensorInsert.diff(moment(NSCal.date)) > 0) {
        console.log('Found sensor insert after latest NS calibration. Not updating local rig calibration');
      } else {
        await storage.setItem(rigCalStr, NSCal)
          .catch(() => {
            console.log('Unable to store NS Calibration');
          });
      }
    } else if (rigCal && (rigCal.date < NSCal.date)) {
      if (rigCalStr !== 'expiredCal') {
        console.log('NS calibration more recent than rig calibration NS Cal Date: ' + NSCal.date + ' Rig Cal Date: ' + rigCal.date);

        storage.setItem(rigCalStr, NSCal)
          .catch(() => {
            console.log('Unable to store NS Calibration');
          });
      } else if ((Math.abs(rigCal.slope - NSCal.slope) > 0.001) || (Math.abs(rigCal.intercept - NSCal.intercept) > 0.001)) {
        console.log('NS calibration more recent than rig calibration NS Cal Date: ' + NSCal.date + ' Rig Cal Date: ' + rigCal.date);
        console.log('Currently operating in expired calibration mode - uploading expired cal record.');

        // Upload a new calibration to NS to match the expiredCal we have
        // Add 1 to the date so it becomes effective
        rigCal.date = NSCal.date + 1;
        xDripAPS.postCalibration(rigCal);
      } else {
        console.log('NS calibration more recent than rig calibration NS Cal Date: ' + NSCal.date + ' Rig Cal Date: ' + rigCal.date);
        console.log('Currently operating in expired calibration mode - NS Cal matches expired cal.');
      }
    } else if (rigCal && (rigCal.date > NSCal.date)) {
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
  let rigSGVs = null;
  let nsSGVs = null;
  let nsQueryError = false;

  await storageLock.lockStorage();

  rigSGVs = await storage.getItem('glucoseHist')
    .catch(error => {
      console.log('Error getting rig SGVs: ' + error);
    });

  if (!rigSGVs) {
    rigSGVs = [];
  }

  rigSGVs = rigSGVs.map((sgv) => {
    if (!sgv.hasOwnProperty('readDateMills')) {
      sgv.readDateMills = moment(sgv.readDate).valueOf();
    }

    return sgv;
  });

  let now = moment().valueOf();
  let minDate = moment().subtract(24, 'hours').valueOf();

  rigSGVs = rigSGVs.filter((sgv) => {
    return sgv.readDateMills >= minDate;
  });

  let nsMisses = rigSGVs.filter((sgv) => {
    return ! sgv.inNS;
  });

  let nsGaps = [ ];

  if (nsMisses.length > 0) {
    let gapStart = nsMisses[0].readDateMills;
    let prevTime = nsMisses[0].readDateMills;
    let gapSGVs = [ nsMisses[0] ];

    for (let i = 1; i < nsMisses.length; ++i) {
      if ((nsMisses[i].readDateMills - prevTime) > 6) {
        nsGaps.push( { gapStart: moment(gapStart), gapEnd: moment(prevTime), gapSGVs: gapSGVs } );
        gapSGVs = [ nsMisses[i] ];
      } else {
        gapSGVs.push(nsMisses[i]);
      }
    }
  }

  console.log(nsGaps);

  _.each(nsGaps, async (nsGap) => {

    // get the NS entries that are in the gap
    nsSGVs = await xDripAPS.SGVsBetween(nsGap.gapStart, nsGap.gapEnd, Math.round((nsGap.gapEnd.valueOf() - nsGap.gapStart.valueOf()) / 5*60000) + 1 )
      .catch(error => {
        console.log('Unable to get NS SGVs to match unfiltered with BG Check: ' + error);
      });

    if (!nsSGVs) {
      nsSGVs = [];
    }

    // give them all a dateMills to make comparison's easier
    nsSGVs = nsSGVs.map((sgv) => {
      sgv.dateMills = moment(sgv.date).valueOf();
      return sgv;
    });

    nsSGVs = _.sortBy(nsSGVs, ['dateMills']);

    // mark any matches we have so we don't re-upload them
    _.each(nsSGVs, (nsSGV) => {
      let matches = nsGap.gapSGVs.filter( (sgv) => {
        return Math.abs(sgv.readDateMills - nsSGV.dateMills) < 60000;
      });

      if (matches.length > 0) {
        matches[0].inNS = true;
      }
    });

    // upload any gapSGVs to NS that we haven't found a NS match
    _.each(nsGap.gapSGVs, (gapSGV) => {
      if (gapSGV.glucose && !gapSGV.inNS) {
        console.log('Uploading to NS: ', gapSGV);
        //xDripAPS.post(gapSGV, false);
      }
    });
  });

  let rigGaps = [ ];

  if (rigSGVs.length > 0) {
    let prevTime = rigSGVs[0].readDateMills;

    for (let i = 1; i < rigSGVs.length; ++i) {
      if ((rigSGVs[i].readDateMills - rigSGVs) > 6) {
        rigGaps.push( { gapStart: moment(prevTime), gapEnd: moment(rigSGVs[i].readDateMills) } );
      }
    }

    if ((now - prevTime) > 5) {
      rigGaps.push( { gapStart: moment(prevTime), gapEnd: moment(now) } );
    }
  } else {
    rigGaps.push( { gapStart: moment(minDate), gapEnd: moment(now) } );
  }

  console.log(rigGaps);

  _.each(rigGaps, async (gap) => {
    nsSGVs = await xDripAPS.SGVsBetween(gap.gapStart, gap.gapEnd, Math.round((gap.gapEnd.valueOf() - gap.gapStart.valueOf()) / 5*60000) + 1 )
      .catch(error => {
        console.log('Unable to get NS SGVs to match unfiltered with BG Check: ' + error);
      });

    if (!nsSGVs) {
      nsSGVs = [];
    }

    nsSGVs = nsSGVs.map((sgv) => {
      sgv.dateMills = moment(sgv.date).valueOf();
      return sgv;
    });

    nsSGVs = _.sortBy(nsSGVs, ['dateMills']);

    _.each(nsSGVs, (nsSGV) => {
      let rigSGV = {
        'readDate': nsSGV.dateString,
        'readDateMills': nsSGV.dateMills,
        'filtered': nsSGV.filtered,
        'unfiltered': nsSGV.unfiltered,
        'glucose': nsSGV.sgv,
        'nsNoise': nsSGV.noise,
        'trend': nsSGV.trend,
        'state': 0x00, // Set state to None
        'g5calibrated': false,
        'inNS': true
      };

      console('Storing locally SGV: ', rigSGV);
      rigSGVs.push(rigSGV);
    });
  });

  rigSGVs = _.sortBy(rigSGVs, ['readDateMills']);

  await storage.setItem('glucoseHist', rigSGVs)
    .catch((err) => {
      console.log('Unable to store glucoseHist: ' + err);
    });

  storageLock.unlockStorage();

  console.log('syncSGVs complete');
};

const syncBGChecks = async (sensorInsert, expiredCal) => {
  let NSBGChecks = null;
  let nsQueryError = false;
  let calculateExpiredCal = false;
  let sliceStart = 0;

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

  NSBGChecks = NSBGChecks.map((bgCheck) => {
    let timeVal = moment(bgCheck.created_at);

    bgCheck.created_at = timeVal.format();
    bgCheck.dateMills = timeVal.valueOf();

    return bgCheck;
  });

  NSBGChecks = _.sortBy(NSBGChecks, ['dateMills']);

  sliceStart = 0;

  for (let i = 0; i < NSBGChecks.length; ++i) {
    if (moment(NSBGChecks[i].created_at).diff(sensorInsert) < 0) {
      sliceStart = i+1;
    }
  }

  NSBGChecks = NSBGChecks.slice(sliceStart);

  if (NSBGChecks.length > 0) {
    let bgCheck = NSBGChecks[NSBGChecks.length-1];
    console.log('Most recent NS BG Check - date: ' + bgCheck.created_at + ' type: ' + bgCheck.glucoseType + ' glucose: ' + bgCheck.glucose);
  }

  await storageLock.lockStorage();

  let rigBGChecks = await storage.getItem('bgChecks')
    .catch(error => {
      console.log('Error getting bgChecks: ' + error);
    });

  if (!rigBGChecks || !Array.isArray(rigBGChecks)) {
    rigBGChecks = [];
  }

  rigBGChecks = rigBGChecks.map((bgCheck) => {
    bgCheck.dateMills = moment(bgCheck.date).valueOf();

    return bgCheck;
  });

  let rigDataLength = rigBGChecks.length;
  let rigIndex = 0;

  if (rigDataLength > 0) {
    let bgCheck = rigBGChecks[rigDataLength-1];
    console.log('Most recent Rig BG Check - date: ' + moment(bgCheck.date).format() + ' glucose: ' + bgCheck.glucose + ' unfiltered: ' + bgCheck.unfiltered);
  }

  for (let i = 0; i < NSBGChecks.length; ++i) {
    let nsValue = NSBGChecks[i];
    let rigValue = null;

    for (; rigIndex < rigDataLength; ++rigIndex) {
      let timeDiff = nsValue.dateMills - rigBGChecks[rigIndex].dateMills;

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
        'dateMills': nsValue.dateMills,
        'glucose': nsValue.glucose,
        'type': 'NS'
      };

      rigBGChecks.push(rigValue);

      // we found a new BG check, trigger calculating new calibration
      calculateExpiredCal = true;
    }
  }

  rigBGChecks = _.sortBy(rigBGChecks, ['dateMills']);

  sliceStart = 0;

  // Remove any cal data we have
  // that predates the last sensor insert
  for (let i=0; i < rigBGChecks.length; ++i) {
    if (rigBGChecks[i].dateMills < sensorInsert.valueOf()) {
      sliceStart = i+1;
    }
  }

  rigBGChecks = rigBGChecks.slice(sliceStart);

  // Add unfiltered values if any are missing
  for (let i=0; i < rigBGChecks.length; ++i) {
    let rigValue = rigBGChecks[i];

    if (!('unfiltered' in rigValue) || !rigValue.unfiltered) {
      rigValue.unfiltered = await calibration.getUnfiltered(storage, moment(rigValue.dateMills));
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
      let timeDiff = NSBGChecks[nsIndex].dateMills - rigValue.dateMills;

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

  if (calculateExpiredCal) {
    let newCal = await calibration.expiredCalibration(storage, rigBGChecks, null, sensorInsert, null);

    await storageLock.lockStorage();

    await storage.setItem('expiredCal', newCal)
      .catch((err) => {
        console.log('Unable to store expiredCal: ' + err);
      });

    storageLock.unlockStorage();

    if (expiredCal && newCal) {
      console.log('Expired calibration use disabled - not sending it to NS');
      // xDripAPS.postCalibration(newCal);
    }
  }

  console.log('syncBGChecks complete');
};

const syncNS = async (storage_, storageLock_, expiredCal) => {
  let sensorInsert = null;
  let nsQueryError = false;

  storage = storage_;
  storageLock = storageLock_;

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
      syncNS(storage, storageLock, expiredCal);
    }, 5 * 60000);

    return;
  }

  // For each of these, we catch any errors and then
  // call resolve so the Promise.all works as it
  // should and doesn't trigger early because of an error
  var syncCalPromise = new timeLimitedPromise(4*60*1000, async (resolve) => {
    await syncCal(sensorInsert, expiredCal);
    resolve();
  });

  let syncSGVsPromise = new timeLimitedPromise(4*60*1000, async (resolve) => {
    await syncSGVs();
    resolve();
  });

  let syncBGChecksPromise = new timeLimitedPromise(4*60*1000, async (resolve) => {
    await syncBGChecks(sensorInsert, expiredCal);
    resolve();
  });

  await Promise.all([syncCalPromise, syncSGVsPromise, syncBGChecksPromise])
    .catch(error => {
      console.log('syncNS error: ' + error);
    });

  console.log('syncNS complete - setting 5 minute timer');

  setTimeout(() => {
    // Restart the syncNS after 5 minute
    syncNS(storage, storageLock, expiredCal);
  }, 5 * 60000);
};

module.exports = syncNS;
