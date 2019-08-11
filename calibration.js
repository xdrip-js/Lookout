// Rule 1 - Clear calibration records upon CGM Sensor Change/Insert
// Rule 2 - Don't allow any BG calibrations or take in any new calibrations
//         within 15 minutes of last sensor insert
// Rule 3 - Only use Single Point Calibration for 1st SENSOR_STABLE hours since Sensor insert
// Rule 4 - Do not use LSR until we have 3 or more calibration points.
//         Use SinglePoint calibration only for less than MIN_LSR_PAIRS calibration points.
//         SinglePoint simply uses the latest calibration record and assumes
//         the intercept is 0.
// Rule 5 - Drop back to SinglePoint calibration if slope is out of bounds
//         (>MAXSLOPE or <MINSLOPE)
//         only applies to expired calibration
// Rule 6 - TODO: Drop back to SinglePoint calibration if intercept is out of bounds
//         (> minimum unfiltered value in calibration record set or
//          < - minimum unfiltered value in calibration record set)

const Debug = require('debug');

const log = Debug('calibration:log');
const error = Debug('calibration:error');
const debug = Debug('calibration:debug');

const moment = require('moment');
const _ = require('lodash');
const constants = require('./constants');
const stats = require('./calcStats');
const xDripAPS = require('./xDripAPS')();

module.exports = {};
const calibrationExports = module.exports;

const MAXSLOPE = 12500;
const MINSLOPE = 450;
const SENSOR_STABLE = 12; // hours
const SENSOR_WARM = 2; // hours

const leftPadString = (str, len) => ' '.repeat(Math.max(0, len - str.toString().length)) + str;

const calcGlucose = (sgv, calibration) => {
  let glucose = Math.round((sgv.unfiltered - calibration.intercept) / calibration.slope);

  // If BG is below 40, set it to 39 so it's displayed correctly in NS
  glucose = glucose < 40 ? 39 : glucose;

  return glucose;
};

calibrationExports.calcGlucose = calcGlucose;

// calibrationPairs has three values for each array element:
//   glucose => the "true" glucose value for the pair
//   unfiltered => the sensor's unfiltered glucose value for the pair
//   readDateMills => the sensor's read date for the pair in ms since 1/1/1970 00:00
const lsrCalibration = (calibrationPairs) => {
  let sumX = 0;
  let sumY = 0;
  let meanX = 0;
  let meanY = 0;
  let stddevX = 0;
  let stddevY = 0;
  let sumXY = 0;
  let sumXSq = 0;
  let sumYSq = 0;
  let sumSqDiffX = 0;
  let sumSqDiffY = 0;
  let yError = 0;
  let slopeError = 0;

  const n = calibrationPairs.length;
  const tarr = [];
  const multipliers = [];

  const returnVal = {
    slope: 0,
    intercept: 0,
    calibrationType: 'LeastSquaresRegression',
  };

  for (let i = 0; i < n; i += 1) {
    sumX += calibrationPairs[i].glucose;
    sumY += calibrationPairs[i].unfiltered;
  }

  meanX = sumX / n;
  meanY = sumY / n;

  for (let i = 0; i < n; i += 1) {
    let diff = calibrationPairs[i].glucose - meanX;
    sumSqDiffX += diff * diff;

    diff = calibrationPairs[i].unfiltered - meanY;
    sumSqDiffY += diff * diff;
  }

  stddevX = Math.sqrt(sumSqDiffX / (n - 1));
  stddevY = Math.sqrt(sumSqDiffY / (n - 1));


  const firstDate = calibrationPairs[0].readDateMills;

  for (let i = 0; i < n; i += 1) {
    tarr.push(calibrationPairs[i].readDateMills - firstDate);
  }

  let multiplier = 1;

  for (let i = 0; i < n; i += 1) {
    if (i !== 0) {
      multiplier = 1 + tarr[i - 1] / (tarr[n - 1] * 2);

      // boundary check
      if ((multiplier < 1) || (multiplier > 2)) {
        multiplier = 1;
      }
    }

    multipliers.push(multiplier);

    sumXY = (sumXY + calibrationPairs[i].glucose * calibrationPairs[i].unfiltered) * multiplier;
    sumXSq = (sumXSq + calibrationPairs[i].glucose * calibrationPairs[i].glucose) * multiplier;
    sumYSq = (sumYSq
      + calibrationPairs[i].unfiltered * calibrationPairs[i].unfiltered) * multiplier;
  }

  const denominator = Math.sqrt(((n * sumXSq - sumX * sumX) * (n * sumYSq - sumY * sumY)));
  if ((denominator === 0) || (stddevX === 0)) {
    return null;
  }
  const r = (n * sumXY - sumX * sumY) / denominator;

  returnVal.slope = r * stddevY / stddevX;
  returnVal.intercept = meanY - returnVal.slope * meanX;

  // calculate error
  let varSum = 0;
  for (let j = 0; j < n; j += 1) {
    const varVal = (
      calibrationPairs[j].unfiltered - returnVal.intercept
      - returnVal.slope * calibrationPairs[j].glucose
    );

    debug(`LSR Cal - record ${j},`
     + ` ${moment(calibrationPairs[j].readDateMills).format('ddd YYYY-MM-DDTHH:MM:SSG\\M\\TZZ')},`
     + ` unfiltered: ${leftPadString(Math.round(calibrationPairs[j].unfiltered), 6)},`
     + ` sgv: ${leftPadString(calibrationPairs[j].glucose, 3)},`
     + ` calculated: ${leftPadString(calcGlucose(calibrationPairs[j], returnVal), 3)},`
     + ` multiplier: ${leftPadString(multipliers[j].toFixed(3), 5)}`);

    varSum += varVal * varVal;
  }

  const delta = n * sumXSq - sumX * sumX;
  const vari = 1.0 / (n - 2.0) * varSum;

  yError = Math.sqrt(vari / delta * sumXSq);
  slopeError = Math.sqrt(n / delta * vari);

  debug(`LSR Calibration yError: ${yError}, slopeError: ${slopeError}`);

  return returnVal;
};

const singlePointCalibration = (calibrationPairs) => {
  const returnVal = {
    slope: 0,
    intercept: 0,
    calibrationType: 'SinglePoint',
  };

  const x = calibrationPairs[calibrationPairs.length - 1].glucose;
  const y = calibrationPairs[calibrationPairs.length - 1].unfiltered;
  returnVal.intercept = 0;
  returnVal.slope = y / x;

  return returnVal;
};

const calculateTxmitterCalibration = (
  options, lastCal, lastTxmitterCalTime, latestBgCheckTime, sensorInsert, glucoseHist, currSGV,
) => {
  // set it to a high number so we upload a new cal
  // if we don't have a previous calibration

  // Do not calculate a new calibration value
  // if we don't have a valid calibrated glucose reading
  if (currSGV.glucose > constants.MAX_CAL_SGV || currSGV.glucose < constants.MIN_CAL_SGV) {
    log(`Current glucose out of range to calibrate: ${currSGV.glucose}`);
    return null;
  }

  let calErr = 100;
  let calValue;
  let i;
  let calReturn = null;
  const calPairs = [];

  if (lastCal) {
    calValue = calcGlucose(currSGV, lastCal);
    calErr = Math.abs(calValue - currSGV.glucose);

    log(
      `Current CGM calculated calibration error: ${Math.round(calErr * 10) / 10} `
      + `calibrated value: ${Math.round(calValue * 10) / 10} `
      + `slope: ${Math.round(lastCal.slope * 10) / 10} `
      + `intercept: ${Math.round(lastCal.intercept * 10) / 10}`,
    );
  }

  // Check if we need a calibration
  if (!lastCal || (calErr > 5) || (lastCal.type === 'Unity') || (lastCal.type === 'SinglePoint')) {
    calPairs.push(currSGV);

    // Suitable values need to be:
    // 1. less than 300 mg/dl
    // 2. greater than 80 mg/dl
    // 3. calibrated via Txmitter, not Lookout
    // 4. 12 minutes after the last Txmitter calibration time
    //    (it takes up to 2 readings to reflect calibration updates)
    // 5. After the latest sensorInsert (ignore sensorInsert if we didn't get one)
    for (i = (glucoseHist.length - 1); ((i >= 0) && (calPairs.length < 10)); i -= 1) {
      // Only use up to 10 of the most recent suitable readings
      const sgv = glucoseHist[i];

      if (('unfiltered' in sgv) && (sgv.readDateMills > (lastTxmitterCalTime + 12 * 60 * 1000))
        && (sgv.glucose < constants.MAX_CAL_SGV) && (sgv.glucose > constants.MIN_CAL_SGV)
        && sgv.g5calibrated && (!sensorInsert || (sgv.readDateMills > sensorInsert.valueOf()))) {
        calPairs.unshift(sgv);
      }
    }

    // If we have at least MIN_LSR_PAIRS good pairs and we are off by more than 5
    // OR we have at least 8 and our current cal error is > 1
    if (((calErr > 5) && calPairs.length > options.min_lsr_pairs)
      || ((calErr > 1) && (calPairs.length > 8))) {
      const calResult = lsrCalibration(calPairs);

      if (!calResult) {
        error('CGM calculated calibration calculated denominator of zero');
        return null;
      }

      log(`CGM lsrCalibration: numPoints=${calPairs.length}, slope=${calResult.slope}, intercept=${calResult.intercept}`);

      if ((calResult.slope > MAXSLOPE) || (calResult.slope < MINSLOPE)) {
        // wait until the next opportunity
        error(`CGM calculated calibration slope out of range: ${calResult.slope}`);
        return null;
      }

      calReturn = {
        date: currSGV.readDateMills,
        scale: 1,
        intercept: calResult.intercept,
        slope: calResult.slope,
        type: calResult.calibrationType,
      };
    } else if (calErr > 5) {
      log(`CGM calculated calibration update needed, but only ${calPairs.length} suitable glucose pairs found.`);
      return null;
    }
  }

  if (calReturn) {
    log(`Calculated new CGM calculated calibration with ${calReturn.type} due to ${calPairs.length} calibration pairs:\n%O`, calReturn);
  } else if (lastCal && latestBgCheckTime && (latestBgCheckTime.diff(moment(lastCal.date).subtract(6, 'minutes')) > 0)) {
    log('BG Check occurred, but no CGM calculated calibration update needed. Setting calibration date to be after latest BG check time.');

    // this disables the CGM calculated calibration until we have
    // at least 2 readings showing it doesn't need an update (6 minutes).
    calReturn = _.cloneDeep(lastCal);
    calReturn.date = Date.now();
  } else {
    log('No CGM calculated calibration update needed.');
  }

  return calReturn;
};

calibrationExports.calculateTxmitterCalibration = calculateTxmitterCalibration;

const saveExpiredCal = async (storage, newCal) => {
  await storage.setItem('expiredCal', newCal)
    .catch(() => {
      error('Unable to store new NS Calibration');
    });
};

calibrationExports.saveExpiredCal = saveExpiredCal;

const interpolateUnfiltered = (SGVBefore, SGVAfter, valueTime) => {
  const totalTime = SGVAfter.readDateMills - SGVBefore.readDateMills;
  const totalDelta = SGVAfter.unfiltered - SGVBefore.unfiltered;
  const fractionTime = (valueTime.valueOf() - SGVBefore.readDateMills) / totalTime;

  debug(`SGVBefore Time: ${SGVBefore.readDateMills} SGVBefore Unfiltered: ${SGVBefore.unfiltered}`);
  debug(` SGVAfter Time: ${SGVAfter.readDateMills}  SGVAfter Unfiltered: ${SGVAfter.unfiltered}`);

  if (totalTime > 12 * 60000) {
    debug(`Total time exceeds 12 minutes: ${totalTime}ms`);
    debug('Not interpolating unfiltered values.');

    return null;
  }

  const returnVal = totalDelta * fractionTime + SGVBefore.unfiltered;

  debug(`  BGCheck Time: ${valueTime.valueOf()}       Unfilter Value: ${Math.round(returnVal * 1000) / 1000}`);
  debug(`     totalTime: ${totalTime} totalDelta: ${Math.round(totalDelta * 1000) / 1000} fractionTime: ${Math.round(fractionTime * 100) / 100}`);

  return returnVal;
};

const getUnfilteredFromNS = async (valueTime) => {
  let NSSGVs = null;
  const timeStart = moment(valueTime.valueOf()).subtract(11, 'minutes');
  const timeEnd = moment(valueTime.valueOf()).add(11, 'minutes');
  let SGVBefore = null;
  let SGVBeforeTime = null;
  let SGVAfter = null;
  let SGVAfterTime = null;

  // Get NS SGV immediately before BG Check
  NSSGVs = await xDripAPS.SGVsBetween(timeStart, timeEnd, 5)
    .catch((err) => {
      error(`Unable to get NS SGVs to match unfiltered with BG Check: ${err}`);
    });

  if (!NSSGVs) {
    NSSGVs = [];
  }

  for (let i = 0; i < NSSGVs.length; i += 1) {
    NSSGVs[i].dateMills = moment(NSSGVs[i].date).valueOf();
  }

  NSSGVs = _.sortBy(NSSGVs, ['dateMills']);

  for (let i = 0; i < (NSSGVs.length - 1); i += 1) {
    // Is the next SGV after valueTime
    // and the current SGV is before valueTime
    SGVBeforeTime = NSSGVs[i].dateMills;
    SGVAfterTime = NSSGVs[i + 1].dateMills;
    if ((SGVBeforeTime < valueTime.valueOf()) && (SGVAfterTime > valueTime.valueOf())) {
      SGVBefore = NSSGVs[i];
      SGVAfter = NSSGVs[i + 1];
      break;
    }
  }

  if (SGVBefore && SGVAfter) {
    return interpolateUnfiltered(
      xDripAPS.convertEntryToxDrip(SGVBefore), xDripAPS.convertEntryToxDrip(SGVAfter), valueTime,
    );
  }
  debug(`Unable to find bounding SGVs for BG Check at ${valueTime.format()}`);
  return null;
};

const getUnfiltered = async (valueTime, glucoseHist, sgv) => {
  const rigSGVs = _.map(glucoseHist, value => ({
    readDateMills: value.readDateMills,
    unfiltered: value.unfiltered,
  }));

  if (rigSGVs && (rigSGVs.length > 1)) {
    let SGVBefore = null;
    let SGVBeforeTime = null;
    let SGVAfter = null;
    let SGVAfterTime = null;

    if (sgv) {
      // if we got an sgv argument
      // it is the latest sgv that hasn't
      // been appended to the storage array
      // yet
      rigSGVs.push(sgv);
    }

    // we can assume they are already sorted
    // since we sort before storing them
    // Search from the end since in the normal case
    // the Txmitter cal is processed within 2 readings
    // of the event.
    for (let i = (rigSGVs.length - 2); i >= 0; i -= 1) {
      // Is the next SGV after valueTime
      // and the current SGV is before valueTime
      SGVBeforeTime = rigSGVs[i].readDateMills;
      SGVAfterTime = rigSGVs[i + 1].readDateMills;
      if ((valueTime.valueOf() > SGVBeforeTime) && (SGVAfterTime > valueTime.valueOf())) {
        SGVBefore = rigSGVs[i];
        SGVAfter = rigSGVs[i + 1];
        break;
      }
    }

    if (SGVBefore && SGVAfter) {
      return interpolateUnfiltered(SGVBefore, SGVAfter, valueTime);
    }
    debug(`Unable to find bounding SGVs for calibration at ${valueTime.format()}`);
    debug('Looking in Nightscout');
    return getUnfilteredFromNS(valueTime);
  }

  return null;
};

calibrationExports.getUnfiltered = getUnfiltered;

const expiredCalibration = async (
  options, storage, bgChecks, lastExpiredCal, sensorInsert, glucoseHist, sgv,
) => {
  let calPairs = [];
  let calReturn = null;
  let calPairsStart = 0;
  const maxLsrPairs = options.max_lsr_pairs;
  const minLsrPairs = options.min_lsr_pairs;
  let maxLsrPairsAge = options.max_lsr_pairs_age;

  debug(`options: %O\nmaxLsrPairs: ${maxLsrPairs}\nminLsrPairs: ${minLsrPairs}\nmaxLsrPairsAge: ${maxLsrPairsAge}`, options);

  // convert to milliseconds
  maxLsrPairsAge *= 24 * 60 * 60000;

  for (let i = 0; i < bgChecks.length; i += 1) {
    let unfiltered = null;

    if (!('unfiltered' in bgChecks[i]) || !bgChecks[i].unfiltered) {
      // Try to get the unfiltered value if we don't have it
      /* eslint-disable-next-line no-await-in-loop */
      unfiltered = await getUnfiltered(moment(bgChecks[i].dateMills), glucoseHist, sgv);
    } else {
      ({ unfiltered } = bgChecks[i]);
    }

    if ((bgChecks[i].type !== 'Unity') && (unfiltered)
      && (bgChecks[i].glucose > constants.MIN_CAL_SGV)
      && (bgChecks[i].glucose < constants.MAX_CAL_SGV)) {
      calPairs.push({
        unfiltered,
        glucose: bgChecks[i].glucose,
        readDateMills: bgChecks[i].dateMills,
      });
    }
  }

  if (calPairs.length > 0) {
    const latestCalTime = calPairs[calPairs.length - 1].readDateMills;

    for (let i = 0; i < (calPairs.length - 1); i += 1) {
      if (
        (sensorInsert
        && (calPairs[i].readDateMills - sensorInsert.valueOf()) < SENSOR_STABLE * 60 * 60000)
        || ((latestCalTime - calPairs[i].readDateMills) > maxLsrPairsAge)) {
        calPairsStart = i + 1;
      }
    }

    // save at least two if we have two
    if (calPairsStart >= (calPairs.length - 1)) {
      calPairsStart = Math.max(calPairs.length - 2, 0);
    }

    calPairs = calPairs.slice(calPairsStart);
  }

  // don't use too many
  calPairs = calPairs.slice(Math.max(0, calPairs.length - maxLsrPairs + 1));

  // If we have at least 3 good pairs, use LSR
  if (calPairs.length >= minLsrPairs) {
    const calResult = lsrCalibration(calPairs);

    if (calResult && (calResult.slope < MAXSLOPE) && (calResult.slope > MINSLOPE)) {
      log(`expired lsrCalibration: numPoints=${calPairs.length}, slope=${calResult.slope}, intercept=${calResult.intercept}`);

      calReturn = {
        date: calPairs[calPairs.length - 1].readDateMills,
        scale: 1,
        intercept: calResult.intercept,
        slope: calResult.slope,
        type: calResult.calibrationType,
      };
    } else if (calResult) {
      log(`Falling back to single point cal due to slope out of range: ${calResult.slope}`);
    } else {
      log('Falling back to single point cal due to calibration result denominator of zero');
    }
  }

  if (!calReturn && (calPairs.length > 0)) {
    const calResult = singlePointCalibration(calPairs);

    log(`expired singlePointCalibration: glucose=${calPairs[calPairs.length - 1].glucose}, unfiltered=${calPairs[calPairs.length - 1].unfiltered}, slope=${calResult.slope}, intercept=0`);

    calReturn = {
      date: calPairs[calPairs.length - 1].readDateMills,
      scale: 1,
      intercept: calResult.intercept,
      slope: calResult.slope,
      type: calResult.calibrationType,
    };
  }

  if (!calReturn) {
    log('No suitable glucose pairs found for expired calibration.');
  }

  // Default to sending a new calibration calculation
  let slopeDelta = 1;
  let interceptDelta = 1;

  if (lastExpiredCal && calReturn) {
    slopeDelta = Math.abs(calReturn.slope - lastExpiredCal.slope);
    interceptDelta = Math.abs(calReturn.intercept - lastExpiredCal.intercept);
  }

  if ((slopeDelta < 1) && (interceptDelta < 1)) {
    log(`No calibration update required: slopeDelta=${Math.round(slopeDelta * 10) / 10} interceptDelta=${Math.round(interceptDelta * 10) / 10}`);

    return lastExpiredCal;
  }
  if (calReturn) {
    log(`New expired calibration with ${calReturn.type} due to ${calPairs.length} calibration pairs:\n%O`, calReturn);
  }

  if (storage) {
    saveExpiredCal(storage, calReturn);
  }

  return calReturn;
};

calibrationExports.expiredCalibration = expiredCalibration;

const getExpiredCal = async (storage) => {
  const lastExpiredCal = await storage.getItem('expiredCal')
    .catch((err) => {
      error(`Unable to obtain current Expired Calibration${err}`);
    });

  return lastExpiredCal;
};

calibrationExports.getExpiredCal = getExpiredCal;

const getTxmitterCal = async (storage) => {
  const lastCal = await storage.getItem('g5Calibration')
    .catch((err) => {
      error(`Unable to obtain current NS Calibration${err}`);
    });

  return lastCal;
};

calibrationExports.getTxmitterCal = getTxmitterCal;

const saveTxmitterCal = async (storage, newCal) => {
  await storage.setItem('g5Calibration', newCal)
    .catch(() => {
      error('Unable to store new NS Calibration');
    });
};

calibrationExports.saveTxmitterCal = saveTxmitterCal;

const getLastTxmitterCal = (bgChecks) => {
  let lastTxmitterCal = null;

  if (bgChecks) {
    for (let ii = (bgChecks.length - 1); ii >= 0; ii -= 1) {
      if ((bgChecks[ii].type === 'Txmitter') || (bgChecks[ii].type === 'Unity')) {
        lastTxmitterCal = bgChecks[ii];
        break;
      }
    }
  }

  return lastTxmitterCal;
};

calibrationExports.getLastTxmitterCal = getLastTxmitterCal;

const getActiveCal = async (options, storage) => {
  const lastCal = await getTxmitterCal(storage);
  const lastExpiredCal = await getExpiredCal(storage);

  if (lastCal && (lastCal.type !== 'Unity')) {
    return lastCal;
  }

  if (lastExpiredCal) {
    return lastExpiredCal;
  }
  return false;
};

calibrationExports.getActiveCal = getActiveCal;

// provide the most recent Txmitter calibration
const getLastCal = async (storage) => {
  const bgChecks = await storage.getItem('bgChecks')
    .catch((err) => {
      error(`Unable to get bgChecks storage item: ${err}`);
    });

  const lastTxmitterCal = getLastTxmitterCal(bgChecks);

  return lastTxmitterCal;
};

calibrationExports.getLastCal = getLastCal;

calibrationExports.clearCalibration = async (storage) => {
  await storage.delItem('g5Calibration');
  await storage.delItem('expiredCal');
  await storage.delItem('bgChecks');

  const newCal = {
    date: Date.now(),
    scale: 1,
    intercept: 0,
    slope: 1000,
    type: 'Unity',
  };

  saveTxmitterCal(storage, newCal);
};

calibrationExports.haveCalibration = async (storage) => {
  const lastCal = await getTxmitterCal(storage);
  const lastExpiredCal = await getExpiredCal(storage);

  return ((lastCal && (lastCal.type !== 'Unity')) || lastExpiredCal);
};

const validateTxmitterCalibration = (sensorInsert, sensorStop, latestBgCheckTime, lastCal) => {
  let bgCheckDelta = 0;
  let bgCheckTime = null;
  let sensorInsertTime = null;
  let sensorInsertDelta = 0;
  let sensorStopTime = null;
  let sensorStopDelta = 0;

  if (!lastCal) {
    log('No Transmitter Calibration');
    return false;
  }

  const lastCalTime = moment(lastCal.date).subtract(6, 'minutes');

  if (latestBgCheckTime) {
    bgCheckDelta = latestBgCheckTime.diff(lastCalTime);
    bgCheckTime = latestBgCheckTime.format();
  }

  if (sensorInsert) {
    sensorInsertDelta = sensorInsert.diff(lastCalTime);
    sensorInsertTime = sensorInsert.format();
  }

  if (sensorStop) {
    sensorStopDelta = sensorStop.diff(lastCalTime);
    sensorStopTime = sensorStop.format();
  }

  if (!sensorInsert
    || (lastCal.type === 'Unity')
    || (sensorInsertDelta > 0)
    || (sensorStopDelta > 0)
    || (bgCheckDelta > 0)) {
    log('\n-----------------------------------------------\n'
      + 'No valid Transmitter Calibration -\n'
      + ` lastCalType: ${lastCal.type}\n`
      + `     lastCal: ${moment(lastCal.date).format()}\n`
      + ` lastBgCheck: ${bgCheckTime}      bgCheckDelta: ${bgCheckDelta}\n`
      + `sensorInsert: ${sensorInsertTime} sensorInsertDelta: ${sensorInsertDelta}\n`
      + `  sensorStop: ${sensorStopTime}   sensorStopDelta: ${sensorStopDelta}\n`
      + ' - if lastCalType set to "Unity", calibration is not valid to use\n'
      + ' - if bgCheckDelta > 0, latest BG check is after latest calibration calculation, invalidating calibration\n'
      + ' - if sensorInsertDelta > 0, latest sensor insert is after latest calibration calculation, invalidating calibration\n'
      + ' - if sensorStop > 0, latest sensor stop is after last calibration calculation, invalidating calibration\n'
      + '-----------------------------------------------');
    return false;
  }
  log('Have valid Transmitter Calibration');
  return true;
};

const validateExpiredCalibration = async (
  sensorInsert, sensorStop, lastExpiredCal, options, storage, bgChecks, glucoseHist,
) => {
  let sensorInsertTime = null;
  let sensorInsertDelta = 0;
  let sensorStopTime = null;
  let sensorStopDelta = 0;
  let expiredCal = lastExpiredCal;

  if (!lastExpiredCal) {
    log('No Expired Calibration');
    // Try to generate an expired calibration
    // This is needed on fresh startups when we haven't tried to generate one yet
    expiredCal = await expiredCalibration(
      options, storage, bgChecks, lastExpiredCal, sensorInsert, glucoseHist,
    );

    if (!expiredCal) {
      return false;
    }

    saveExpiredCal(storage, expiredCal);
  }

  const lastExpiredCalTime = moment(expiredCal.date).subtract(6, 'minutes');

  if (sensorInsert) {
    sensorInsertDelta = sensorInsert.diff(lastExpiredCalTime);
    sensorInsertTime = sensorInsert.format();
  }

  if (sensorStop) {
    sensorStopDelta = sensorStop.diff(lastExpiredCalTime);
    sensorStopTime = sensorStop.format();
  }

  if (!sensorInsert || !expiredCal
    || (sensorInsertDelta > 0)
    || (sensorStopDelta > 0)) {
    log('\n-----------------------------------------------\n'
      + 'No valid Expired Calibration -\n'
      + `lastExpiredCal: ${moment(expiredCal.date).format()}\n`
      + `  sensorInsert: ${sensorInsertTime} sensorInsertDelta: ${sensorInsertDelta}`
      + `    sensorStop: ${sensorStopTime}   sensorStopDelta: ${sensorStopDelta}`
      + ' - if sensorInsertDelta > 0, latest sensor insert is after latest calibration calculation, invalidating calibration\n'
      + ' - if sensorStop > 0, latest sensor stop is after last calibration calculation, invalidating calibration\n'
      + '-----------------------------------------------');
    return false;
  }
  log('Have valid Expired Calibration');
  return true;
};

const validateCalibration = async (
  options, storage, sensorInsert, sensorStop, latestBgCheckTime,
) => {
  const lastCal = await getTxmitterCal(storage);
  const lastExpiredCal = await getExpiredCal(storage);
  let glucoseHist = await storage.getItem('glucoseHist');
  let bgChecks = await storage.getItem('bgChecks');

  if (!glucoseHist) {
    glucoseHist = [];
  }

  if (!bgChecks) {
    bgChecks = [];
  }

  return (validateTxmitterCalibration(sensorInsert, sensorStop, latestBgCheckTime, lastCal)
    || validateExpiredCalibration(
      sensorInsert, sensorStop, lastExpiredCal, options, storage, bgChecks, glucoseHist,
    ));
};

calibrationExports.validateCalibration = validateCalibration;

calibrationExports.calibrateGlucose = async (
  storage, options, sensorInsert, sensorStop, glucoseHist, uncalibratedSgv,
) => {
  let lastCal = await getTxmitterCal(storage);
  let expiredCal = await getExpiredCal(storage);

  const sgv = _.cloneDeep(uncalibratedSgv);

  let bgChecks = await storage.getItem('bgChecks')
    .catch((err) => {
      error(`Error getting bgChecks: ${err}`);
    });

  if (!bgChecks) {
    bgChecks = [];
  }

  let lastTxmitterCalTime = 0;
  let newCal = null;

  const lastTxmitterCal = getLastTxmitterCal(bgChecks);

  if (lastTxmitterCal) {
    lastTxmitterCalTime = lastTxmitterCal.dateMills;
  }

  sgv.g5calibrated = true;

  sgv.inExtendedSession = false;
  sgv.inExpiredSession = false;

  let latestBgCheckTime = null;

  if (bgChecks.length > 0) {
    latestBgCheckTime = moment(bgChecks[bgChecks.length - 1].dateMills);
  }

  if (glucoseHist.length > 0) {
    newCal = calculateTxmitterCalibration(
      options, lastCal, lastTxmitterCalTime, latestBgCheckTime, sensorInsert, glucoseHist, sgv,
    );

    expiredCal = await expiredCalibration(
      options, storage, bgChecks, expiredCal, sensorInsert, glucoseHist, sgv,
    );
  }

  if (newCal) {
    lastCal = newCal;
  }

  if (!sgv.glucose && options.extend_sensor
    && validateTxmitterCalibration(sensorInsert, sensorStop, latestBgCheckTime, lastCal)) {
    sgv.glucose = calcGlucose(sgv, lastCal);
    sgv.inExtendedSession = true;

    log('Invalid glucose value received from transmitter, replacing with calibrated unfiltered value from Txmitter calibration algorithm');
    log(`Calibrated SGV: ${sgv.glucose} unfiltered: ${sgv.unfiltered} slope: ${lastCal.slope} intercept: ${lastCal.intercept}`);

    sgv.g5calibrated = false;
  }

  if (options.expired_cal
    && await validateExpiredCalibration(
      sensorInsert, sensorStop, expiredCal, options, storage, bgChecks, glucoseHist,
    )) {
    const expiredCalGlucose = calcGlucose(sgv, expiredCal);

    if (!sgv.glucose) {
      sgv.glucose = expiredCalGlucose;
      sgv.inExpiredSession = true;

      log('Invalid glucose value received from transmitter, replacing with calibrated unfiltered value from expired calibration algorithm');
      log(`Calibrated SGV: ${sgv.glucose} unfiltered: ${sgv.unfiltered} slope: ${expiredCal.slope} intercept: ${expiredCal.intercept}`);

      sgv.g5calibrated = false;
    } else {
      const calErr = expiredCalGlucose - sgv.glucose;
      log(`Current Expired Cal error: ${Math.round(calErr * 10) / 10} calibrated value: ${Math.round(expiredCalGlucose * 10) / 10} slope: ${Math.round(expiredCal.slope * 10) / 10} intercept: ${Math.round(expiredCal.intercept * 10) / 10} type: ${expiredCal.type}`);
    }
  }

  if (newCal) {
    log(`New CGM calibration: slope = ${newCal.slope}, intercept = ${newCal.intercept}, scale = ${newCal.scale}`);

    saveTxmitterCal(storage, newCal);
  }

  if (lastCal) {
    // a valid calibration is available to use
    sgv.trend = stats.calcTrend(calcGlucose, glucoseHist, lastCal, sgv);

    sgv.noise = stats.calcSensorNoise(calcGlucose, glucoseHist, lastCal, sgv);

    if ((sgv.noise < 0.4) && sensorInsert
      && ((sgv.readDateMills - sensorInsert.valueOf()) < SENSOR_WARM * 60 * 60000)) {
      // put in light noise to account for warm up
      log(`Setting noise to light because SGV date (${moment(sgv.readDateMills).format()} - ${sensorInsert.format()} < ${SENSOR_WARM} hours`);
      sgv.noise = 0.4;
    }
  } else {
    // No way to calculate a trend since we don't know the calibration slope
    sgv.trend = 0;

    // Put in light noise to account for uncertainty
    sgv.noise = 0.4;
  }

  sgv.nsNoise = stats.calcNSNoise(sgv.noise, glucoseHist);
  sgv.noiseString = stats.NSNoiseString(sgv.nsNoise);

  log(`Current sensor trend: ${Math.round(sgv.trend * 10) / 10} Sensor Noise: ${Math.round(sgv.noise * 1000) / 1000} NS Noise: ${sgv.nsNoise}`);

  return sgv;
};
