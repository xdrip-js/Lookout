'use strict';

const moment = require('moment');
const calibration = require('./calibration');

var exports = module.exports = {};

// Calculate the sum of the distance of all points (overallDistance)
// Calculate the overall distance between the first and the last point (overallDistance)
// Calculate the noise as the following formula: 1 - sod / overallDistance
// Noise will get closer to zero as the sum of the individual lines are mostly in a straight or straight moving curve
// Noise will get closer to one as the sum of the distance of the individual lines get large
// Also add multiplier to get more weight to the latest BG values
// Also added weight for points where the delta shifts from pos to neg or neg to pos (peaks/valleys)
// the more peaks and valleys, the more noise is amplified
const calcNoise = (sgvArr) => {
  let noise = 0;

  let n=sgvArr.length;

  let firstSGV = sgvArr[0].glucose * 1000.0;
  let firstTime = sgvArr[0].readDate / 1000.0 * 30.0;

  let lastSGV = sgvArr[n-1].glucose * 1000.0;
  let lastTime = sgvArr[n-1].readDate / 1000.0 * 30.0;

  let xarr = [];

  for (let i=0; i < n; i++) {
    xarr.push(sgvArr[i].readDate / 1000.0 * 30.0 - firstTime);
  }

  // sod = sum of distances
  var sod=0;
  var lastDelta=0;

  for (let i=1; i < n; i++) {
    // y2y1Delta adds a multiplier that gives 
    // higher priority to the latest BG's
    let y2y1Delta=(sgvArr[i].glucose - sgvArr[i-1].glucose) * 1000.0 * (1 + i / (n*3));

    let x2x1Delta=xarr[i] - xarr[i-1];

    if ((lastDelta > 0) && (y2y1Delta < 0)) {
      // switched from positive delta to negative, increase noise impact  
      y2y1Delta=y2y1Delta * 1.1;
    }
    else if ((lastDelta < 0) && (y2y1Delta > 0)) {
      // switched from negative delta to positive, increase noise impact 
      y2y1Delta=y2y1Delta * 1.2;
    }

    sod=sod + Math.sqrt(Math.pow(x2x1Delta, 2) + Math.pow(y2y1Delta, 2));
  }

  var overallsod=Math.sqrt(Math.pow(lastSGV - firstSGV, 2) + Math.pow(lastTime - firstTime, 2));

  if (sod === 0) {
    // protect from divide by 0
    noise = 0;
  } else {
    noise=1 - (overallsod/sod);
  }

  return noise;
};

exports.calcSensorNoise = (glucoseHist, lastCal) => {
  const MAXRECORDS=8;
  const MINRECORDS=4;
  let sgvArr = [];

  for (let i = (glucoseHist.length-MAXRECORDS-1); i < glucoseHist.length; ++i) {
    // Only use values that are > 30 to filter out invalid values.
    if (glucoseHist[i].glucose > 30) {
      // use the unfiltered data with the most recent calculated calibration value
      // this will provide a noise calculation that is independent of calibration jumps
      sgvArr.push({
        'glucose': calibration.calcGlucose(glucoseHist[i], lastCal),
        'readDate': glucoseHist[i].readDate
      });
    }
  }

  if (sgvArr.length < MINRECORDS) {
    return 0;
  } else {
    return calcNoise(sgvArr);
  }
};

// Return 10 minute trend total
exports.calcTrend = (glucoseHist, lastCal) => {
  let sgvHist = null;

  let trend = 0;


  if (glucoseHist.length > 1) {
    let minDate = moment().subtract(16, 'minutes');
    let maxDate = null;
    let sliceStart = 0;
    let timeSpan = 0;
    let totalDelta = 0;

    // delete any deltas > 16 minutes
    for (var i=0; i < glucoseHist.length; ++i) {
      if (moment(glucoseHist[i].readDate).diff(minDate) < 0) {
        sliceStart = i+1;
      }
    }

    sgvHist = glucoseHist.slice(sliceStart);

    if (sgvHist.length > 1) {
      minDate = sgvHist[0].readDate;
      maxDate = sgvHist[sgvHist.length-1].readDate;

      // Use the current calibration value to calculate the glucose from the
      // unfiltered data. This allows the trend calculation to be independent
      // of the calibration jumps
      totalDelta = calibration.calcGlucose(sgvHist[sgvHist.length-1], lastCal) - calibration.calcGlucose(sgvHist[0], lastCal);

      timeSpan = (maxDate - minDate)/1000.0/60.0;

      trend=10 * totalDelta / timeSpan;
    }
  } else {
    console.log('Not enough history for trend calculation: ' + glucoseHist.length);
  }

  return trend;
};

// Return sensor noise
exports.calcNSNoise = (noise, glucoseHist) => {
  let nsNoise = 0; // Unknown
  let currSGV = glucoseHist[glucoseHist.length-1];
  let deltaSGV = 0;

  if (glucoseHist.length > 1) {
    let priorSGV = glucoseHist[glucoseHist.length-2];

    if ((currSGV.glucose > 30) && (priorSGV.glucose > 30)) {
      deltaSGV = currSGV.glucose - priorSGV.glucose;
    }
  }

  if (currSGV.glucose > 400) {
    console.log('Glucose ' + currSGV.glucose + ' > 400 - setting noise level Heavy');
    nsNoise = 4;
  } else if (currSGV.glucose < 40) {
    console.log('Glucose ' + currSGV.glucose + ' < 40 - setting noise level Light');
    nsNoise = 2;
  } else if (Math.abs(deltaSGV) > 30) {
    // This is OK even during a calibration jump because we don't want OpenAPS to be too
    // agressive with the "false" trend implied by a large positive jump
    console.log('Glucose change ' + deltaSGV + ' out of range [-30, 30] - setting noise level Heavy');
    nsNoise = 4;
  } else if (noise < 0.35) {
    nsNoise = 1; // Clean
  } else if (noise < 0.5) {
    nsNoise = 2; // Light
  } else if (noise < 0.7) {
    nsNoise = 3; // Medium
  } else if (noise >= 0.7) {
    nsNoise = 4; // Heavy
  }

  return nsNoise;
};

