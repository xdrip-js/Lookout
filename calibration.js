var _ = require('lodash');

var exports = module.exports = {};

// calibrationPairs has three values for each array element:
//   glucose => the "true" glucose value for the pair
//   unfiltered => the sensor's unfiltered glucose value for the pair
//   readDate => the sensor's read date for the pair in ms since 1/1/1970 00:00
exports.lsrCalibration = (calibrationPairs) => {
  var sumX=0;
  var sumY=0;
  var meanX=0;
  var meanY=0;
  var stddevX=0;
  var stddevY=0;
  var sumXY=0;
  var sumXSq=0;
  var sumYSq=0;
  var r=0;
  var n=calibrationPairs.length
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

  sumSqDiffX = 0;
  sumSqDiffY = 0;

  for (let i=0; i < n; ++i) {
    let diff = calibrationPairs[i].glucose - meanX;
    sumSqDiffX = sumSqDiffX + diff*diff;

    diff = calibrationPairs[i].unfiltered - meanY;
    sumSqDiffY = sumSqDiffY + diff*diff;
  }

  stddevX = Math.sqrt(sumSqDiffX / (n-1));
  stddevY = Math.sqrt(sumSqDiffY / (n-1));


  var usingDates=0

  var firstDate=calibrationPairs[0].readDate;

  for (let i=0; i<n; i++) {
      tarr.push(calibrationPairs[i].readDate - firstDate); 
  }

  var multiplier=1

  for (let i=0; i<n; i++ ) {
    if (i != 0) {
      multiplier=1 + tarr[i-1] / (tarr[n-1] * 2);

      // boundary check
      if ((multiplier < 1) || (multiplier > 2)) {
        multiplier=1;
      }
    }

    console.log('Calibration - record ' + i + ', ' + new Date(calibrationPairs[i].readDate) + ', weighted multiplier=' + multiplier);
 
    sumXY=(sumXY + calibrationPairs[i].glucose * calibrationPairs[i].unfiltered) * multiplier;
    sumXSq=(sumXSq + calibrationPairs[i].glucose * calibrationPairs[i].glucose) * multiplier;
    sumYSq=(sumYSq + calibrationPairs[i].unfiltered * calibrationPairs[i].unfiltered) * multiplier;
  }

  var denominator=Math.sqrt(((n * sumXSq - sumX*sumX) * (n * sumYSq - sumY*sumY)));
  if ((denominator == 0) || (stddevX == 0)) {
    returnVal.slope=1000;
    returnVal.yIntercept=0;
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

exports.singlePointCalibration = (calibrationPairs) => {
  var returnVal = {
    'slope': 0,
    'yIntercept': 0,
    'calibrationType': 'SinglePoint'
  };

  x=calibrationPairs[calibrationPairs.length-1].glucose;
  y=calibrationPairs[calibrationPairs.length-1].unfiltered;
  returnVal.yIntercept=0;
  returnVal.slope=y / x;
  console.log('singlePointCalibration: x=' + x + ', y=' + y + ', slope=' + returnVal.slope + ', yIntercept=0'); 

  return returnVal;
};

