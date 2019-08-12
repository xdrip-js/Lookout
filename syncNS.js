

const moment = require('moment');
const Debug = require('debug');

const log = Debug('syncNS:log');
const error = Debug('syncNS:error');
const debug = Debug('syncNS:debug');

const _ = require('lodash');
const TimeLimitedPromise = require('./timeLimitedPromise');
const xDripAPS = require('./xDripAPS')();

let options = null;
let storage = null;
let transmitter = null;

const syncCal = async (sensorInsert) => {
  let rigCal = null;
  let NSCal = null;
  let nsQueryError = false;
  let rigCalStr = null;

  log('syncCal started');

  NSCal = await xDripAPS.latestCal()
    .catch((err) => {
      error(`Error getting NS calibration: ${err}`);
      nsQueryError = true;
    });

  if (nsQueryError) {
    return;
  }

  if (NSCal) {
    debug(`SyncNS NS Cal - date: ${moment(NSCal.date).format()} slope: ${Math.round(NSCal.slope * 100) / 100} intercept: ${Math.round(NSCal.intercept * 10) / 10}`);
  }

  await storage.lock();

  // Always synchronize only the transmitter calibration
  // The expired cal is always able to be calculated
  // form the BG Checks and glucose values in NS
  rigCalStr = 'g5Calibration';

  rigCal = await storage.getItem(rigCalStr)
    .catch((err) => {
      error(`Error getting rig calibration: ${err}`);
    });

  if (rigCal) {
    debug(`SyncNS Rig Cal - date: ${moment(rigCal.date).format()} slope: ${Math.round(rigCal.slope * 100) / 100} intercept: ${Math.round(rigCal.intercept * 10) / 10}`);
  }

  if (NSCal) {
    if (!rigCal) {
      debug('No rig calibration, storing NS calibration');

      if (sensorInsert && sensorInsert.diff(moment(NSCal.date)) > 0) {
        debug('Found sensor insert after latest NS calibration. Not updating local rig calibration');
      } else {
        await storage.setItem(rigCalStr, NSCal)
          .catch(() => {
            error('Unable to store NS Calibration');
          });
      }
    } else if (rigCal && (rigCal.date < NSCal.date)) {
      debug(`NS calibration more recent than rig calibration NS Cal Date: ${NSCal.date} Rig Cal Date: ${rigCal.date}`);

      storage.setItem(rigCalStr, NSCal)
        .catch(() => {
          error('Unable to store NS Calibration');
        });
    } else if (rigCal && (rigCal.date > NSCal.date)) {
      debug(`Rig calibration more recent than NS calibration NS Cal Date: ${NSCal.date} Rig Cal Date: ${rigCal.date}`);
      debug('Upoading rig calibration');

      xDripAPS.postCalibration(rigCal);
    } else {
      debug('Rig and NS calibration dates match - no sync needed');
    }
  } else if (rigCal) {
    debug('No NS calibration - uploading rig calibration');
    xDripAPS.postCalibration(rigCal);
  } else {
    debug('No rig or NS calibration');
  }

  storage.unlock();

  log('syncCal complete');
};

const syncEvent = async (itemName, eventType) => {
  let rigItem = null;
  let nsEvent = null;
  let nsQueryError = false;

  log(`Syncing rig ${itemName} and NS ${eventType} started`);

  nsEvent = await xDripAPS.latestEvent(eventType)
    .catch((err) => {
      error(`Unable to get latest ${eventType} record from NS: ${err}`);
      nsQueryError = true;
    });

  if (nsQueryError) {
    throw new Error('NS Query Error');
  }

  if (nsEvent) {
    debug(`SyncNS NS ${eventType}- date: ${nsEvent.format()}`);
  }

  await storage.lock();

  rigItem = await storage.getItem(itemName)
    .catch((err) => {
      error(`Error getting rig ${itemName}: ${err}`);
    });

  if (rigItem) {
    rigItem = moment(rigItem);
    debug(`SyncNS Rig ${itemName}- date: ${rigItem.format()}`);
  }

  let latestEvent = rigItem;

  if (nsEvent) {
    if (!rigItem) {
      debug(`No rig ${itemName}, storing NS ${eventType}`);

      latestEvent = nsEvent;

      await storage.setItem(itemName, nsEvent.valueOf())
        .catch(() => {
          error(`Unable to store ${itemName}`);
        });
    } else if (rigItem && ((nsEvent.valueOf() - rigItem.valueOf()) > 1000)) {
      debug(`NS ${eventType} more recent than rig ${itemName} NS date: ${nsEvent.format()} Rig date: ${rigItem.format()}`);

      latestEvent = nsEvent;

      storage.setItem(itemName, nsEvent.valueOf())
        .catch(() => {
          error(`Unable to store ${itemName}`);
        });
    } else if (rigItem && ((rigItem.valueOf() - nsEvent.valueOf()) > 1000)) {
      debug(`Rig ${itemName} more recent than NS ${eventType} NS date: ${nsEvent.format()} Rig date: ${rigItem.format()}`);
      debug(`Uploading rig ${itemName}`);

      latestEvent = rigItem;
      xDripAPS.postEvent(eventType, rigItem);
    } else {
      debug(`Rig and NS ${eventType} dates match - no sync needed`);
    }
  } else if (rigItem) {
    debug(`No NS ${eventType} - uploading rig sensor insert`);
    latestEvent = rigItem;
    xDripAPS.postEvent(eventType, rigItem);
  } else {
    debug(`No rig ${itemName} or NS ${eventType}`);
  }

  storage.unlock();

  log(`Syncing rig ${itemName} and NS ${eventType} complete`);

  return latestEvent;
};

const syncSGVs = async () => {
  let rigSGVs = null;
  let nsSGVs = null;

  log('syncSGVs started');

  await storage.lock();

  rigSGVs = await storage.getArray('glucoseHist')
    .catch((err) => {
      error(`Error getting rig SGVs: ${err}`);
    });

  // make sure they all have readDateMills for easy math
  for (let i = 0; i < rigSGVs; i += 1) {
    rigSGVs[i].readDateMills = moment(rigSGVs[i].readDate).valueOf();
  }

  const minDate = moment().subtract(24, 'hours').valueOf();

  // remote items older than 24 hours
  rigSGVs = rigSGVs.filter(sgv => sgv.readDateMills >= minDate);

  // get the list of which SGVs we have
  // that haven't been verified to be in NS
  const nsMisses = rigSGVs.filter(sgv => !sgv.inNS);

  const nsGaps = [];

  // Assemble the list of overall gaps that account
  // for consecutive misses as one gap to minimize
  // the number of NS queries
  if (nsMisses.length > 0) {
    let gapStart = nsMisses[0].readDateMills;
    let prevTime = nsMisses[0].readDateMills;
    let gapSGVs = [nsMisses[0]];

    for (let i = 1; i < nsMisses.length; i += 1) {
      const gap = { gapStart: moment(gapStart), gapEnd: moment(prevTime), gapSGVs };

      if ((nsMisses[i].readDateMills - prevTime) > 6 * 60000) {
        nsGaps.push(gap);
        gapStart = nsMisses[i].readDateMills;
        gapSGVs = [nsMisses[i]];
      } else {
        gapSGVs.push(nsMisses[i]);
      }

      prevTime = nsMisses[i].readDateMills;
    }

    if (gapSGVs.length > 0) {
      nsGaps.push({ gapStart: moment(gapStart), gapEnd: moment(prevTime), gapSGVs });
    }
  }

  debug('nsGaps: ');
  _.each(nsGaps, (gap) => {
    debug(`    gapStart: ${moment(gap.gapStart).format()} gapEnd: ${moment(gap.gapEnd).format()}`);
  });

  await Promise.all(_.map(nsGaps, async (nsGap) => {
    let nsQueryError = false;

    // get the NS entries that are in the gap
    nsSGVs = await xDripAPS.SGVsBetween(
      nsGap.gapStart, nsGap.gapEnd,
      Math.round((nsGap.gapEnd.valueOf() - nsGap.gapStart.valueOf()) * 2 / 5 * 60000) + 1,
    ).catch((err) => {
      error(`Unable to get NS SGVs to match unfiltered with BG Check: ${err}`);
      nsQueryError = true;
    });

    if (!nsSGVs) {
      nsSGVs = [];
    }

    // if the ns query failed, just bail out of this gap
    if (nsQueryError) {
      return;
    }

    // give them all a dateMills to make comparison's easier
    for (let i = 0; i < nsSGVs.length; i += 1) {
      nsSGVs[i].dateMills = moment(nsSGVs[i].date).valueOf();
    }

    nsSGVs = _.sortBy(nsSGVs, ['dateMills']);

    // mark any matches we have so we don't re-upload them
    _.each(nsSGVs, (nsSGV) => {
      const matches = nsGap.gapSGVs.filter(
        sgv => Math.abs(sgv.readDateMills - nsSGV.dateMills) < 60000,
      );

      if (matches.length > 0) {
        matches[0].inNS = true;
      }
    });

    // upload any gapSGVs to NS that we haven't found a NS match
    _.each(nsGap.gapSGVs, (gapSGV) => {
      if (gapSGV.glucose && !gapSGV.inNS) {
        xDripAPS.post(gapSGV, false, true);
      }
    });
  }));

  let rigGaps = null;

  if (transmitter) {
    rigGaps = transmitter.sgvGaps(rigSGVs);
  }

  debug('rigGaps:\n%O', rigGaps);

  await Promise.all(_.map(rigGaps, async (gap) => {
    nsSGVs = await xDripAPS.SGVsBetween(
      gap.gapStart, gap.gapEnd,
      Math.round((gap.gapEnd.valueOf() - gap.gapStart.valueOf()) / 5 * 60000) + 1,
    ).catch((err) => {
      error(`Unable to get NS SGVs to match unfiltered with BG Check: ${err}`);
    });

    if (!nsSGVs) {
      nsSGVs = [];
    }

    for (let i = 0; i < nsSGVs.length; i += 1) {
      nsSGVs[i].dateMills = moment(nsSGVs[i].date).valueOf();
    }

    nsSGVs = _.sortBy(nsSGVs, ['dateMills']);

    _.each(nsSGVs, (nsSGV) => {
      const rigSGV = {
        readDate: nsSGV.dateString,
        readDateMills: nsSGV.dateMills,
        filtered: nsSGV.filtered,
        unfiltered: nsSGV.unfiltered,
        glucose: nsSGV.sgv,
        nsNoise: nsSGV.noise,
        trend: nsSGV.trend,
        state: 0x00, // Set state to None
        g5calibrated: false,
        inNS: true,
      };

      rigSGVs.push(rigSGV);
    });
  }));

  rigSGVs = _.sortBy(rigSGVs, ['readDateMills']);

  await storage.setItem('glucoseHist', rigSGVs)
    .catch((err) => {
      error(`Unable to store glucoseHist: ${err}`);
    });

  storage.unlock();

  log('syncSGVs complete');

  return ((rigSGVs.length > 0) && rigSGVs[rigSGVs.length - 1]) || null;
};

const syncBGChecks = async (sensorInsert, sensorStop) => {
  let NSBGChecks = null;
  let nsQueryError = false;
  const bgChecksFromNS = [];
  let sliceStart = 0;
  let validBGCheckStartTime = sensorInsert;

  log('syncBGChecks started');

  if (!sensorInsert || (sensorStop && sensorStop.valueOf() > sensorInsert.valueOf())) {
    validBGCheckStartTime = sensorStop;
  }

  debug(`NS Query for BG Checks since: ${validBGCheckStartTime}`);

  NSBGChecks = await xDripAPS.BGChecksSince(validBGCheckStartTime)
    .catch((err) => {
      // Bail out since we can't sync if we don't have NS access
      error(`Error getting NS BG Checks: ${err}`);
      nsQueryError = true;
    });

  if (nsQueryError) {
    return null;
  }

  if (!NSBGChecks) {
    NSBGChecks = [];
  }

  debug(`SyncNS NS BG Checks: ${NSBGChecks.length}`);

  for (let i = 0; i < NSBGChecks.length; i += 1) {
    const timeVal = moment(NSBGChecks[i].created_at);

    NSBGChecks[i].created_at = timeVal.format();
    NSBGChecks[i].dateMills = timeVal.valueOf();
  }

  NSBGChecks = _.sortBy(NSBGChecks, ['dateMills']);

  sliceStart = 0;

  for (let i = 0; i < NSBGChecks.length; i += 1) {
    if (moment(NSBGChecks[i].created_at).diff(validBGCheckStartTime) < 0) {
      sliceStart = i + 1;
    }
  }

  NSBGChecks = NSBGChecks.slice(sliceStart);

  if (NSBGChecks.length > 0) {
    const bgCheck = NSBGChecks[NSBGChecks.length - 1];
    debug(`Most recent NS BG Check - date: ${bgCheck.created_at} type: ${bgCheck.glucoseType} glucose: ${bgCheck.glucose}`);
  }

  await storage.lock();

  let rigBGChecks = await storage.getArray('bgChecks')
    .catch((err) => {
      error(`Error getting bgChecks: ${err}`);
    });

  for (let i = 0; i < rigBGChecks.length; i += 1) {
    rigBGChecks[i].dateMills = moment(rigBGChecks[i].date).valueOf();
  }

  const rigDataLength = rigBGChecks.length;

  if (rigDataLength > 0) {
    const bgCheck = rigBGChecks[rigDataLength - 1];
    debug(`Most recent Rig BG Check - date: ${moment(bgCheck.date).format()} glucose: ${bgCheck.glucose} unfiltered: ${bgCheck.unfiltered}`);
  }

  for (let i = 0; i < NSBGChecks.length; i += 1) {
    const nsValue = NSBGChecks[i];
    let rigValue = null;
    let rigIndex = 0;

    for (; rigIndex < rigDataLength; rigIndex += 1) {
      const timeDiff = nsValue.dateMills - rigBGChecks[rigIndex].dateMills;

      if (Math.abs(timeDiff) < 10 * 1000) {
        rigValue = rigBGChecks[rigIndex];
        break;
      } else if (timeDiff < 0) {
        // Bail if rigBGChecks time is later than NS BG time
        break;
      }
    }

    if (!rigValue) {
      rigValue = {
        date: moment(nsValue.created_at).valueOf(),
        dateMills: nsValue.dateMills,
        glucose: nsValue.glucose,
        type: 'NS',
      };

      rigBGChecks.push(rigValue);

      // we found a new BG check
      bgChecksFromNS.push(rigValue);
    }
  }

  rigBGChecks = _.sortBy(rigBGChecks, ['dateMills']);

  sliceStart = 0;

  // Remove any cal data we have
  // that predates the last sensor insert
  for (let i = 0; i < rigBGChecks.length; i += 1) {
    if (rigBGChecks[i].dateMills < validBGCheckStartTime.valueOf()) {
      sliceStart = i + 1;
    }
  }

  rigBGChecks = rigBGChecks.slice(sliceStart);

  const bgIndexes = [];
  const promises = [];

  // try to fill in any missing unfiltered values
  for (let i = 0; i < rigBGChecks.length; i += 1) {
    if (transmitter && (!('unfiltered' in rigBGChecks[i]) || !rigBGChecks[i].unfiltered)) {
      bgIndexes.push(i);
      promises.push(transmitter.getUnfiltered(moment(rigBGChecks[i].dateMills)));
    }
  }

  const results = await Promise.all(promises);

  for (let i = 0; i < results.length; i += 1) {
    rigBGChecks[bgIndexes[i]].unfiltered = results[i];
  }

  await storage.setItem('bgChecks', rigBGChecks)
    .catch((err) => {
      debug(`Unable to store bgChecks: ${err}`);
    });

  storage.unlock();

  let nsIndex = 0;

  for (let rigIndex = 0; rigIndex < rigBGChecks.length; rigIndex += 1) {
    const rigValue = rigBGChecks[rigIndex];
    let nsValue = null;

    for (; nsIndex < NSBGChecks.length; nsIndex += 1) {
      const timeDiff = NSBGChecks[nsIndex].dateMills - rigValue.dateMills;

      if (Math.abs(timeDiff) < 10 * 1000) {
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

  if (transmitter) {
    transmitter.sendBgChecksToTxmitter(bgChecksFromNS);
  }

  log('syncBGChecks complete');

  return rigBGChecks;
};

const calcNextSyncTimeDelay = (sgv) => {
  if (!sgv) {
    // If we don't have a glucose value, just return 5 minutes
    return 5 * 60000;
  }

  let sgvTime = sgv.readDateMills;
  const now = moment().valueOf();

  // If lazy upload is enabled, sync 30 seconds earlier
  // so the prumary rig and the delayed upload rig
  // don't try to upload the same missing data
  const preDelta = options.read_only ? 60000 : 30000;

  // Find the next point in time where
  // 30 seconds less than the next possible
  // transmitter wake up time is later than now
  while ((sgvTime - preDelta) < now) {
    sgvTime += 5 * 60000;
  }

  // Return the amount of time in milliseconds between
  // now and 30 seconds before the next wake up time
  return (sgvTime - preDelta - now);
};

const syncNS = async (options_, storage_, transmitter_) => {
  let sensorInsert = null;
  let sensorStart = null;
  let sensorStop = null;
  let latestSGV = null;
  let bgChecks = null;
  let nsQueryError = false;

  log(
    '\n====================================\n'
    + 'syncNS started'
    + '\n====================================',
  );

  storage = storage_;
  transmitter = transmitter_;
  options = options_;

  sensorInsert = await syncEvent('sensorInsert', 'Sensor Change')
    .catch(() => {
      nsQueryError = true;
    });

  sensorStart = await syncEvent('sensorStart', 'Sensor Start')
    .catch(() => {
      nsQueryError = true;
    });

  if (!sensorInsert || (sensorStart && (sensorStart.valueOf() > sensorInsert.valueOf()))) {
    sensorInsert = sensorStart;
  }

  sensorStop = await syncEvent('sensorStop', 'Sensor Stop')
    .catch(() => {
      nsQueryError = true;
    });

  if (nsQueryError) {
    log(
      '\n====================================\n'
      + 'syncNS - No known sensor insert -  Setting 5 minute timer to try again'
      + '\n====================================',
    );

    setTimeout(() => {
      // Restart the syncNS after 5 minute
      syncNS(options, storage, transmitter);
    }, 5 * 60000);

    return;
  }

  if (sensorStart && (Date.now() - sensorStart.valueOf()) < 130 * 60000) {
    // if we just received a sensor start, go ahead
    // and see if we need to start a sensor session
    if (transmitter && !(await transmitter.inSensorSession())) {
      transmitter.startSensorTime(sensorStart);
    }
  }

  // For each of these, we catch any errors and then
  // call resolve so the Promise.all works as it
  // should and doesn't trigger early because of an error
  const syncCalPromise = new TimeLimitedPromise(4 * 60 * 1000, async (resolve) => {
    await syncCal(sensorInsert);
    resolve();
  });

  const syncSGVsPromise = new TimeLimitedPromise(4 * 60 * 1000, async (resolve) => {
    latestSGV = await syncSGVs();
    resolve();
  });

  const syncBGChecksPromise = new TimeLimitedPromise(4 * 60 * 1000, async (resolve) => {
    bgChecks = await syncBGChecks(sensorInsert, sensorStop);
    resolve();
  });

  await Promise.all([syncCalPromise, syncSGVsPromise, syncBGChecksPromise])
    .catch((err) => {
      error(`syncNS error: ${err}`);
    });

  // have transmitterIO check if the sensor session should be ended.
  if (transmitter) {
    transmitter.checkSensorSession(sensorInsert, sensorStop, bgChecks, latestSGV);
  }

  const timeDelay = calcNextSyncTimeDelay(latestSGV);
  log(
    '\n====================================\n'
    + `syncNS complete - setting ${Math.round(timeDelay / 6000) / 10} minute timer`
    + '\n====================================',
  );

  setTimeout(() => {
    // Restart the syncNS after 5 minute
    syncNS(options, storage, transmitter);
  }, timeDelay);
};

module.exports = syncNS;
