//Rule 1 - Clear calibration records upon CGM Sensor Change/Insert
//Rule 2 - Don't allow any BG calibrations or take in any new calibrations 
//         within 15 minutes of last sensor insert
//Rule 3 - Only use Single Point Calibration for 1st SENSOR_STABLE hours since Sensor insert
//Rule 4 - Do not use LSR until we have 3 or more calibration points. 
//         Use SinglePoint calibration only for less than MIN_LSR_PAIRS calibration points. 
//         SinglePoint simply uses the latest calibration record and assumes 
//         the yIntercept is 0.
//Rule 5 - Drop back to SinglePoint calibration if slope is out of bounds
//         (>MAXSLOPE or <MINSLOPE)
//         only applies to expired calibration
//Rule 6 - TODO: Drop back to SinglePoint calibration if yIntercept is out of bounds 
//         (> minimum unfiltered value in calibration record set or 
//          < - minimum unfiltered value in calibration record set)

const stats = require('./calcStats');
const xDripAPS = require('./xDripAPS')();
var _ = require('lodash');
var moment = require('moment');

var exports = module.exports = {};

const MAXSLOPE = 12500;
const MINSLOPE = 450;
const SENSOR_STABLE = 12; // hours
const SENSOR_WARM = 2; // hours
const MIN_LSR_PAIRS = 2;

// calibrationPairs has three values for each array element:
//   glucose => the "true" glucose value for the pair
//   unfiltered => the sensor's unfiltered glucose value for the pair
//   readDateMills => the sensor's read date for the pair in ms since 1/1/1970 00:00
const lsrCalibration = (calibrationPairs) => {
  var sumX=0;
  var sumY=0;
  var meanX=0;
  var meanY=0;
  var stddevX=0;
  var stddevY=0;
  var sumXY=0;
  var sumXSq=0;
  var sumYSq=0;
  let sumSqDiffX = 0;
  let sumSqDiffY = 0;
  /*eslint-disable no-unused-vars*/
  let yError=0;
  let slopeError=0;
  /*eslint-enable no-unused-vars*/

  var n=calibrationPairs.length;
  var tarr = [];

  var returnVal = {
    'slope': 0,
    'yIntercept': 0,
    'calibrationType': 'LeastSquaresRegression'
  };

  for (let i=0; i < n; ++i) {
    sumX = sumX + calibrationPairs[i].glucose;
    sumY = sumY + calibrationPairs[i].unfiltered;
  }

  meanX = sumX / n;
  meanY = sumY / n;

  for (let i=0; i < n; ++i) {
    let diff = calibrationPairs[i].glucose - meanX;
    sumSqDiffX = sumSqDiffX + diff*diff;

    diff = calibrationPairs[i].unfiltered - meanY;
    sumSqDiffY = sumSqDiffY + diff*diff;
  }

  stddevX = Math.sqrt(sumSqDiffX / (n-1));
  stddevY = Math.sqrt(sumSqDiffY / (n-1));


  var firstDate=calibrationPairs[0].readDateMills;

  for (let i=0; i<n; i++) {
    tarr.push(calibrationPairs[i].readDateMills - firstDate); 
  }

  var multiplier=1;

  for (let i=0; i<n; i++ ) {
    if (i != 0) {
      multiplier=1 + tarr[i-1] / (tarr[n-1] * 2);

      // boundary check
      if ((multiplier < 1) || (multiplier > 2)) {
        multiplier=1;
      }
    }

    console.log('Calibration - record ' + i + ', ' + new Date(calibrationPairs[i].readDateMills) + ', weighted multiplier=' + multiplier);
 
    sumXY=(sumXY + calibrationPairs[i].glucose * calibrationPairs[i].unfiltered) * multiplier;
    sumXSq=(sumXSq + calibrationPairs[i].glucose * calibrationPairs[i].glucose) * multiplier;
    sumYSq=(sumYSq + calibrationPairs[i].unfiltered * calibrationPairs[i].unfiltered) * multiplier;
  }

  var denominator=Math.sqrt(((n * sumXSq - sumX*sumX) * (n * sumYSq - sumY*sumY)));
  if ((denominator == 0) || (stddevX == 0)) {
    return null;
  } else {
    let r=(n * sumXY - sumX * sumY) / denominator;

    returnVal.slope=r * stddevY / stddevX;
    returnVal.yIntercept=meanY - returnVal.slope * meanX;

    // calculate error
    let varSum=0;
    for (let j=0; j<n; j++) {
      let varVal = (calibrationPairs[j].unfiltered - returnVal.yIntercept - returnVal.slope * calibrationPairs[j].glucose);
      varSum=varSum + varVal * varVal;
    }

    let delta=n * sumXSq - sumX*sumX;
    let vari=1.0 / (n - 2.0) * varSum;
  
    yError=Math.sqrt(vari / delta * sumXSq);
    slopeError=Math.sqrt(n / delta * vari);
  }

  return returnVal;
};

const singlePointCalibration = (calibrationPairs) => {
  var returnVal = {
    'slope': 0,
    'yIntercept': 0,
    'calibrationType': 'SinglePoint'
  };

  let x=calibrationPairs[calibrationPairs.length-1].glucose;
  let y=calibrationPairs[calibrationPairs.length-1].unfiltered;
  returnVal.yIntercept=0;
  returnVal.slope=y / x;

  return returnVal;
};

const calculateTxmitterCalibration = (lastCal, lastTxmitterCalTime, sensorInsert, glucoseHist, currSGV) => {
  // set it to a high number so we upload a new cal
  // if we don't have a previous calibration

  // Do not calculate a new calibration value
  // if we don't have a valid calibrated glucose reading
  if (currSGV.glucose > 300 || currSGV.glucose < 80) {
    console.log('Current glucose out of range to calibrate: ' + currSGV.glucose);
    return null;
  }

  var calErr = 100;
  var calValue;
  var i;
  let calReturn = null;

  if (lastCal) {
    calValue = calcGlucose(currSGV, lastCal);
    calErr = Math.abs(calValue - currSGV.glucose);

    console.log('Current CGM calculated calibration error: ' + Math.round(calErr*10)/10 + ' calibrated value: ' + Math.round(calValue*10)/10 + ' slope: ' + Math.round(lastCal.slope*10)/10 + ' intercept: ' + Math.round(lastCal.intercept*10)/10);
  }

  // Check if we need a calibration
  if (!lastCal || (calErr > 5) || (lastCal.type === 'SinglePoint')) {
    var calPairs = [];

    calPairs.push(currSGV);

    // Suitable values need to be:
    //   less than 300 mg/dl
    //   greater than 80 mg/dl
    //   calibrated via Txmitter, not Lookout
    //   12 minutes after the last Txmitter calibration time (it takes up to 2 readings to reflect calibration updates)
    //   After the latest sensorInsert (ignore sensorInsert if we didn't get one)
    for (i=(glucoseHist.length-1); ((i >= 0) && (calPairs.length < 10)); --i) {
      // Only use up to 10 of the most recent suitable readings
      let sgv = glucoseHist[i];

      if ((sgv.readDateMills > (lastTxmitterCalTime + 12*60*1000)) && (sgv.glucose < 300) && (sgv.glucose > 80) && sgv.g5calibrated && (!sensorInsert || (sgv.readDateMills > sensorInsert.valueOf()))) {
        calPairs.unshift(sgv);
      }
    }

    // If we have at least MIN_LSR_PAIRS good pairs and we are off by more than 5
    // OR we have at least 8 and our current cal type is SinglePoint
    // THEN use LSR
    if (((calErr > 5) && calPairs.length > MIN_LSR_PAIRS) || (calPairs.length > 8)) {
      let calResult = lsrCalibration(calPairs);

      console.log('CGM lsrCalibration: numPoints=' + calPairs.length + ', slope=' + calResult.slope + ', yIntercept=' + calResult.yIntercept); 

      if (!calResult) {
        console.log('CGM calculated calibration calculated denominator of zero');
        return null;
      }

      if ((calResult.slope > MAXSLOPE) || (calResult.slope < MINSLOPE)) {
        // wait until the next opportunity
        console.log('CGM calculated calibration slope out of range: ' + calResult.slope);
        return null;
      }

      calReturn = {
        date: currSGV.readDateMills,
        scale: 1,
        intercept: calResult.yIntercept,
        slope: calResult.slope,
        type: calResult.calibrationType
      };
    // Otherwise, only update if we have a calErr > 5
    } else if ((calErr > 5) && (calPairs.length > 0)) {
      let calResult = singlePointCalibration(calPairs);

      console.log('CGM singlePointCalibration: glucose=' + calPairs[calPairs.length-1].glucose + ', unfiltered=' + calPairs[calPairs.length-1].unfiltered + ', slope=' + calResult.slope + ', yIntercept=0'); 

      calReturn = {
        date: currSGV.readDateMills,
        scale: 1,
        intercept: calResult.yIntercept,
        slope: calResult.slope,
        type: calResult.calibrationType
      };
    } else if (calErr > 5) {
      console.log('CGM calculated calibration update needed, but no suitable glucose pairs found.');
      return null;
    }
  }

  if (calReturn) {
    console.log('Calculated new CGM calculated calibration with ' + calReturn.type + ' due to ' + calPairs.length + ' calibration pairs:\n', calReturn);
  } else {
    console.log('No CGM calculated calibration update needed.');
  }

  return calReturn;
};

exports.calculateTxmitterCalibration = calculateTxmitterCalibration;

const calcGlucose = (sgv, calibration) => {
  let glucose = Math.round((sgv.unfiltered-calibration.intercept)/calibration.slope);

  // If BG is below 40, set it to 39 so it's displayed correctly in NS
  glucose = glucose < 40 ? 39 : glucose;

  return glucose;
};

exports.calcGlucose = calcGlucose;

const expiredCalibration = async (storage, bgChecks, lastExpiredCal, sensorInsert, sgv) => {
  let calPairs = [];
  let calReturn = null;
  let calPairsStart = 0;

  for (let i=0; i < bgChecks.length; ++i) {
    if (!('unfiltered' in bgChecks[i]) || !bgChecks[i].unfiltered) {
      // Try to get the unfiltered value if we don't have it
      bgChecks[i].unfiltered = await getUnfiltered(storage, moment(bgChecks[i].dateMills), sgv);
    }

    if ((bgChecks[i].type !== 'Unity') && (bgChecks[i].unfiltered)) {
      calPairs.push({
        unfiltered: bgChecks[i].unfiltered,
        glucose: bgChecks[i].glucose,
        readDateMills: bgChecks[i].dateMills
      });
    }
  }

  // remove calPairs that are less than SENSOR_STABLE hours from the sensor insert
  if (calPairs.length > 0) {
    for (let i=0; i < (calPairs.length - 1); ++i) {
      if (!sensorInsert || ((calPairs[i].readDateMills - sensorInsert.valueOf()) < SENSOR_STABLE*60*60000)) {
        calPairsStart = i+1;
      }
    }

    // save at least two if we have two
    if (calPairsStart >= (calPairs.length - 1)) {
      calPairsStart = Math.max(calPairs.length - 2, 0);
    }

    calPairs = calPairs.slice(calPairsStart);
  }

  // If we have at least 3 good pairs, use LSR
  if (calPairs.length >= MIN_LSR_PAIRS) {
    let calResult = lsrCalibration(calPairs);

    if (calResult && (calResult.slope < MAXSLOPE) && (calResult.slope > MINSLOPE)) {
      console.log('expired lsrCalibration: numPoints=' + calPairs.length + ', slope=' + calResult.slope + ', yIntercept=' + calResult.yIntercept); 

      calReturn = {
        date: calPairs[calPairs.length-1].readDateMills,
        scale: 1,
        intercept: calResult.yIntercept,
        slope: calResult.slope,
        type: calResult.calibrationType
      };
    } else if (calResult) {
      console.log('Falling back to single point cal due to slope out of range: ' + calResult.slope);
    } else {
      console.log('Falling back to single point cal due to calibration result denominator of zero');
    }
  }

  if (!calReturn && (calPairs.length > 0)) {
    let calResult = singlePointCalibration(calPairs);

    console.log('expired singlePointCalibration: glucose=' + calPairs[calPairs.length-1].glucose + ', unfiltered=' + calPairs[calPairs.length-1].unfiltered + ', slope=' + calResult.slope + ', yIntercept=0'); 

    calReturn = {
      date: calPairs[calPairs.length-1].readDateMills,
      scale: 1,
      intercept: calResult.yIntercept,
      slope: calResult.slope,
      type: calResult.calibrationType
    };
  } else {
    console.log('No suitable glucose pairs found for expired calibration.');
  }

  // Default to sending a new calibration calculation
  let slopeDelta = 1;
  let interceptDelta = 1;

  if (lastExpiredCal && calReturn) {
    slopeDelta = Math.abs(calReturn.slope - lastExpiredCal.slope);
    interceptDelta = Math.abs(calReturn.intercept - lastExpiredCal.intercept);
  }

  if ((slopeDelta < 1) && (interceptDelta < 1)) {
    console.log('No calibration update: slopeDelta=' + Math.round(slopeDelta*10)/10 + ' interceptDelta=' + Math.round(interceptDelta*10)/10);

    return lastExpiredCal;
  } else {
    if (calReturn) {
      console.log('New expired calibration with ' + calReturn.type + ' due to ' + calPairs.length + ' calibration pairs:\n', calReturn);
    }

    saveExpiredCal(storage, calReturn);

    return calReturn;
  }
};

exports.expiredCalibration = expiredCalibration;

const getUnfiltered = async (storage, valueTime, sgv) => {

  let rigSGVs = await storage.getItem('glucoseHist')
    .catch(error => {
      console.log('Error getting rig SGVs: ' + error);
    });

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
    for (let i=(rigSGVs.length-2); i >= 0; --i) {
      // Is the next SGV after valueTime
      // and the current SGV is before valueTime
      SGVBeforeTime = rigSGVs[i].readDateMills;
      SGVAfterTime = rigSGVs[i+1].readDateMills;
      if ((valueTime.valueOf() > SGVBeforeTime) && (SGVAfterTime > valueTime.valueOf())) {
        SGVBefore = rigSGVs[i];
        SGVAfter = rigSGVs[i+1];
        break;
      }
    }

    if (SGVBefore && SGVAfter) {
      return interpolateUnfiltered(SGVBefore, SGVAfter, valueTime);
    }
    console.log('Unable to find bounding SGVs for calibration at ' + valueTime.format());
    console.log('Looking in Nightscout');
    return await getUnfilteredFromNS(valueTime);
  }
};

exports.getUnfiltered = getUnfiltered;

const getUnfilteredFromNS = async (valueTime) => {
  let NSSGVs = null;
  let timeStart = moment(valueTime.valueOf()).subtract(11, 'minutes');
  let timeEnd = moment(valueTime.valueOf()).add(11, 'minutes');
  let SGVBefore = null;
  let SGVBeforeTime = null;
  let SGVAfter = null;
  let SGVAfterTime = null;

  // Get NS SGV immediately before BG Check
  NSSGVs = await xDripAPS.SGVsBetween(timeStart, timeEnd, 5)
    .catch(error => {
      console.log('Unable to get NS SGVs to match unfiltered with BG Check: ' + error);
    });

  if (!NSSGVs) {
    NSSGVs = [];
  }

  NSSGVs = NSSGVs.map((sgv) => {
    sgv.dateMills = moment(sgv.date).valueOf();
    return sgv;
  });

  NSSGVs = _.sortBy(NSSGVs, ['dateMills']);

  for (let i=0; i < (NSSGVs.length-1); ++i) {
    // Is the next SGV after valueTime
    // and the current SGV is before valueTime
    SGVBeforeTime = NSSGVs[i].dateMills;
    SGVAfterTime = NSSGVs[i+1].dateMills;
    if ((SGVBeforeTime < valueTime.valueOf()) && (SGVAfterTime > valueTime.valueOf())) {
      SGVBefore = NSSGVs[i];
      SGVAfter = NSSGVs[i+1];
      break;
    }
  }

  if (SGVBefore && SGVAfter) {
    return interpolateUnfiltered(xDripAPS.convertEntryToxDrip(SGVBefore), xDripAPS.convertEntryToxDrip(SGVAfter), valueTime);
  } else {
    console.log('Unable to find bounding SGVs for BG Check at ' + valueTime.format());
    return null;
  }
};

const interpolateUnfiltered = (SGVBefore, SGVAfter, valueTime) => {
  let totalTime = SGVAfter.readDateMills - SGVBefore.readDateMills;
  let totalDelta = SGVAfter.unfiltered - SGVBefore.unfiltered;
  let fractionTime = (valueTime.valueOf() - SGVBefore.readDateMills) / totalTime;

  console.log('SGVBefore Time: ' + SGVBefore.readDateMills + ' SGVBefore Unfiltered: ' + SGVBefore.unfiltered);
  console.log(' SGVAfter Time: ' + SGVAfter.readDateMills + '  SGVAfter Unfiltered: ' + SGVAfter.unfiltered);

  if (totalTime > 12*60000) {
    console.log('Total time exceeds 12 minutes: ' + totalTime + 'ms');
    console.log('Not interpolating unfiltered values.');

    return null;
  }

  let returnVal = totalDelta * fractionTime + SGVBefore.unfiltered;

  console.log('  BGCheck Time: ' + valueTime.valueOf() + '       Unfilter Value: ' + (Math.round(returnVal*1000)/1000));
  console.log('     totalTime: ' + totalTime + ' totalDelta: ' + (Math.round(totalDelta*1000) / 1000) + ' fractionTime: ' + (Math.round(fractionTime*100)/100));

  return returnVal;
};

const getExpiredCal = async (storage) => {
  let lastExpiredCal = await storage.getItem('expiredCal')
    .catch(error => {
      console.log('Unable to obtain current Expired Calibration' + error);
    });

  return lastExpiredCal;
};

exports.getExpiredCal = getExpiredCal;

const saveExpiredCal = async (storage, newCal) => {
  await storage.setItem('expiredCal', newCal)
    .catch(() => {
      console.log('Unable to store new NS Calibration');
    });
};

exports.saveExpiredCal = saveExpiredCal;

const getTxmitterCal = async (storage) => {
  let lastCal = await storage.getItem('g5Calibration')
    .catch(error => {
      console.log('Unable to obtain current NS Calibration' + error);
    });

  return lastCal;
};

exports.getTxmitterCal = getTxmitterCal;

const saveTxmitterCal = async (storage, newCal) => {
  await storage.setItem('g5Calibration', newCal)
    .catch(() => {
      console.log('Unable to store new NS Calibration');
    });
};

exports.saveTxmitterCal = saveTxmitterCal;

const getLastTxmitterCal = (bgChecks) => {
  let lastTxmitterCal = null;

  if (bgChecks) {
    for (let ii=(bgChecks.length-1); ii >= 0; --ii) {
      if ((bgChecks[ii].type == 'Txmitter') || (bgChecks[ii].type == 'Unity')) {
        lastTxmitterCal = bgChecks[ii];
        break;
      }
    }
  }

  return lastTxmitterCal;
};

exports.getLastTxmitterCal = getLastTxmitterCal;

const getActiveCal = async (options, storage) => {
  let lastCal = await getTxmitterCal(storage);
  let lastExpiredCal = await getExpiredCal(storage);

  if (lastCal && (lastCal.type !== 'Unity')) {
    return lastCal;
  } else if (lastExpiredCal) {
    return lastExpiredCal;
  } else {
    return false;
  }
};

exports.getActiveCal = getActiveCal;

// provide the most recent Txmitter calibration
const getLastCal = async (storage) => {
  let bgChecks = await storage.getItem('bgChecks')
    .catch(error => {
      console.log('Unable to get bgChecks storage item: ' + error);
    });

  let lastTxmitterCal = getLastTxmitterCal(bgChecks);

  return lastTxmitterCal;
};

exports.getLastCal = getLastCal;

exports.clearCalibration = async (storage) => {
  await storage.del('g5Calibration');
  await storage.del('expiredCal');
  await storage.del('bgChecks');

  let newCal = {
    date: Date.now(),
    scale: 1,
    intercept: 0,
    slope: 1000,
    type: 'Unity'
  };

  saveTxmitterCal(storage, newCal);
};

exports.haveCalibration = async (storage) => {
  let lastCal = await getTxmitterCal(storage);
  let lastExpiredCal = await getExpiredCal(storage);

  return ((lastCal && (lastCal.type !== 'Unity')) || lastExpiredCal);
};

const validateTxmitterCalibration = (sensorInsert, sensorStop, bgChecks, lastCal) => {

  let bgCheckDelta = 0;
  let lastCalTime = moment(lastCal.date).subtract(6, 'minutes');

  if (bgChecks.length > 0) {
    bgCheckDelta = moment(bgChecks[bgChecks.length-1].dateMills).diff(lastCalTime);
  }

  let sensorInsertDelta = (sensorInsert && sensorInsert.diff(lastCalTime)) || 0;
  let sensorStopDelta = (sensorStop && sensorStop.diff(lastCalTime)) || 0;

  if (!sensorInsert || !lastCal
    || (lastCal.type === 'Unity')
    || (sensorInsertDelta > 0)
    || (sensorStopDelta > 0)
    || (bgCheckDelta > 0)) {
    console.log('No valid Transmitter Calibration');
    return false;
  } else {
    console.log('Have valid Transmitter Calibration');
    return true;
  }
};

const validateExpiredCalibration = (sensorInsert, sensorStop, lastExpiredCal) => {

  if (!lastExpiredCal) {
    return false;
  }

  let lastExpiredCalTime = moment(lastExpiredCal.date).subtract(6, 'minutes');

  let sensorInsertDelta = (sensorInsert && sensorInsert.diff(lastExpiredCalTime)) || 0;
  let sensorStopDelta = (sensorStop && sensorStop.diff(lastExpiredCalTime)) || 0;

  if (!sensorInsert || !lastExpiredCal
    || (sensorInsertDelta > 0)
    || (sensorStopDelta > 0)) {
    console.log('No valid Expired Calibration');
    return false;
  } else {
    console.log('Have valid Expired Calibration');
    return true;
  }
};

const validateCalibration = async (storage, sensorInsert, sensorStop, bgChecks) => {
  let lastCal = await getTxmitterCal(storage);
  let lastExpiredCal = await getExpiredCal(storage);

  return (validateTxmitterCalibration(sensorInsert, sensorStop, bgChecks, lastCal) || validateExpiredCalibration(sensorInsert, sensorStop, lastExpiredCal));
};

exports.validateCalibration = validateCalibration;

exports.calibrateGlucose = async (storage, options, sensorInsert, sensorStop, glucoseHist, sgv) => {

  let lastCal = await getTxmitterCal(storage);
  let expiredCal = await getExpiredCal(storage);

  let bgChecks = await storage.getItem('bgChecks')
    .catch((err) => {
      console.log('Error getting bgChecks: ' + err);
    });

  if (!bgChecks) {
    bgChecks = [ ];
  }

  let lastTxmitterCalTime = 0;
  let newCal = null;

  let lastTxmitterCal = getLastTxmitterCal(bgChecks);

  if (lastTxmitterCal) {
    lastTxmitterCalTime = lastTxmitterCal.dateMills;
  }

  sgv.g5calibrated = true;

  sgv.inExtendedSession = false;
  sgv.inExpiredSession = false;

  if (glucoseHist.length > 0) {
    newCal = calculateTxmitterCalibration(lastCal, lastTxmitterCalTime, sensorInsert, glucoseHist, sgv);

    expiredCal = await expiredCalibration(storage, bgChecks, expiredCal, sensorInsert, sgv);
  }

  if (newCal) {
    lastCal = newCal;
  }

  if (!sgv.glucose && options.extend_sensor && validateTxmitterCalibration(sensorInsert, sensorStop, bgChecks, lastCal)) {
    sgv.glucose = calcGlucose(sgv, lastCal);
    sgv.inExpiredSession = true;

    console.log('Invalid glucose value received from transmitter, replacing with calibrated unfiltered value from Txmitter calibration algorithm');
    console.log('Calibrated SGV: ' + sgv.glucose + ' unfiltered: ' + sgv.unfiltered + ' slope: ' + lastCal.slope + ' intercept: ' + lastCal.intercept);

    sgv.g5calibrated = false;
  }

  if (options.expired_cal && validateExpiredCalibration(sensorInsert, sensorStop, expiredCal)) {
    let expiredCalGlucose = calcGlucose(sgv, expiredCal);

    if (!sgv.glucose) {
      sgv.glucose = expiredCalGlucose;
      sgv.inExpiredSession = true;

      console.log('Invalid glucose value received from transmitter, replacing with calibrated unfiltered value from expired calibration algorithm');
      console.log('Calibrated SGV: ' + sgv.glucose + ' unfiltered: ' + sgv.unfiltered + ' slope: ' + lastCal.slope + ' intercept: ' + lastCal.intercept);

      sgv.g5calibrated = false;
    } else {
      let calErr = expiredCalGlucose - sgv.glucose;
      console.log('Current expired calibration error: ' + Math.round(calErr*10)/10 + ' calibrated value: ' + Math.round(expiredCalGlucose*10)/10 + ' slope: ' + Math.round(expiredCal.slope*10)/10 + ' intercept: ' + Math.round(expiredCal.intercept*10)/10 + ' type: ' + expiredCal.type);
    }
  }

  if (newCal) {
    console.log('New CGM calibration: slope = ' + newCal.slope + ', intercept = ' + newCal.intercept + ', scale = ' + newCal.scale);

    saveTxmitterCal(storage, newCal);
  }

  if (lastCal) {
    // a valid calibration is available to use
    sgv.trend = stats.calcTrend(calcGlucose, glucoseHist, lastCal, sgv);

    sgv.noise = stats.calcSensorNoise(calcGlucose, glucoseHist, lastCal, sgv);

    if ((sgv.noise < .4) && sensorInsert && ((sgv.readDateMills - sensorInsert.valueOf()) < SENSOR_WARM*60*60000)) {
      // put in light noise to account for warm up
      console.log('Setting noise to light because SGV date (' + moment(sgv.readDateMills).format() + ' - ' + sensorInsert.format() + ' < ' + SENSOR_WARM + ' hours');
      sgv.noise=.4;
    }
  } else {
    // No way to calculate a trend since we don't know the calibration slope
    sgv.trend = 0;

    // Put in light noise to account for uncertainty
    sgv.noise = .4;
  }

  sgv.nsNoise = stats.calcNSNoise(sgv.noise, glucoseHist);
  sgv.noiseString = stats.NSNoiseString(sgv.nsNoise),

  console.log('Current sensor trend: ' + Math.round(sgv.trend*10)/10 + ' Sensor Noise: ' + Math.round(sgv.noise*1000)/1000 + ' NS Noise: ' + sgv.nsNoise);

  return sgv;
};

