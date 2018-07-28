'use strict';

require('should');

var stats = require('./calcStats');
var calibration = require('./calibration');

describe('Test Calibration', function() {

  it('should calculate Dexcom calibration values with Least Squares Regression', function() {

    let glucoseHist = [{
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528890389945,
      'filtered': 161.056,
      'unfiltered': 158.4,
      'glucose': 155,
      'trend': -3.9982585362819747,
      'canBeCalibrated': true,
      'rssi': -59,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    }, {
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528890689766,
      'filtered': 159.36,
      'unfiltered': 156.544,
      'glucose': 153,
      'trend': -3.9992534726850986,
      'canBeCalibrated': true,
      'rssi': -63,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    }, {
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528890989467,
      'filtered': 157.504,
      'unfiltered': 154.432,
      'glucose': 150,
      'trend': -4.667973699302471,
      'canBeCalibrated': true,
      'rssi': -55,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    }, {
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528891289963,
      'filtered': 155.488,
      'unfiltered': 151.872,
      'glucose': 147,
      'trend': -5.3332266687999565,
      'canBeCalibrated': true,
      'rssi': -80,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    }, {
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528891589664,
      'filtered': 153.312,
      'unfiltered': 149.984,
      'glucose': 145,
      'trend': -5.333937846289246,
      'canBeCalibrated': true,
      'rssi': -82,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    }, {
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528891889576,
      'filtered': 151.008,
      'unfiltered': 147.264,
      'glucose': 141,
      'trend': -5.999273421330083,
      'canBeCalibrated': true,
      'rssi': -79,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    }, {
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528892189592,
      'filtered': 148.544,
      'unfiltered': 144.256,
      'glucose': 138,
      'trend': -6.002474353316756,
      'canBeCalibrated': true,
      'rssi': -77,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    }];

    let currSGV = {
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528892489488,
      'filtered': 145.92,
      'unfiltered': 141.632,
      'glucose': 134,
      'trend': -7.334767687903413,
      'canBeCalibrated': true,
      'rssi': -79,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    };

    let lastCal = calibration.calculateG5Calibration(null, 0, glucoseHist, currSGV);

    lastCal.slope.should.be.greaterThan(.8);
    lastCal.slope.should.be.lessThan(.9);
    lastCal.intercept.should.be.greaterThan(33);
    lastCal.intercept.should.be.lessThan(34);
    lastCal.type.should.equal('LeastSquaresRegression');
  });

  it('should not calculate Single Point calibration if not enough records', function() {

    let glucoseHist = [{
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528890389945,
      'filtered': 161.056,
      'unfiltered': 158.4,
      'glucose': 155,
      'trend': -3.9982585362819747,
      'canBeCalibrated': true,
      'rssi': -59,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    }, {
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528890689766,
      'filtered': 159.36,
      'unfiltered': 156.544,
      'glucose': 153,
      'trend': -3.9992534726850986,
      'canBeCalibrated': true,
      'rssi': -63,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    }];

    let currSGV = {
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528892489488,
      'filtered': 145.92,
      'unfiltered': 141.632,
      'glucose': 134,
      'trend': -7.334767687903413,
      'canBeCalibrated': true,
      'rssi': -79,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    };

    let lastCal = calibration.calculateG5Calibration(null, 0, glucoseHist, currSGV);

    lastCal.slope.should.be.greaterThan(1.05);
    lastCal.slope.should.be.lessThan(1.06);
    lastCal.intercept.should.equal(0);
    lastCal.type.should.equal('SinglePoint');
  });
});

describe('Test Stats', function() {

  it('should calculate Sensor Noise', function() {

    let glucoseHist = [{
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528890389945,
      'filtered': 161.056,
      'unfiltered': 158.4,
      'glucose': 155,
      'trend': -3.9982585362819747,
      'canBeCalibrated': true,
      'rssi': -59,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    }, {
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528890689766,
      'filtered': 159.36,
      'unfiltered': 156.544,
      'glucose': 153,
      'trend': -3.9992534726850986,
      'canBeCalibrated': true,
      'rssi': -63,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    }, {
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528890989467,
      'filtered': 157.504,
      'unfiltered': 154.432,
      'glucose': 150,
      'trend': -4.667973699302471,
      'canBeCalibrated': true,
      'rssi': -55,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    }, {
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528891289963,
      'filtered': 155.488,
      'unfiltered': 151.872,
      'glucose': 147,
      'trend': -5.3332266687999565,
      'canBeCalibrated': true,
      'rssi': -80,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    }, {
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528891589664,
      'filtered': 153.312,
      'unfiltered': 149.984,
      'glucose': 145,
      'trend': -5.333937846289246,
      'canBeCalibrated': true,
      'rssi': -82,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    }, {
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528891889576,
      'filtered': 151.008,
      'unfiltered': 147.264,
      'glucose': 141,
      'trend': -5.999273421330083,
      'canBeCalibrated': true,
      'rssi': -79,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    }, {
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528892189592,
      'filtered': 148.544,
      'unfiltered': 144.256,
      'glucose': 138,
      'trend': -6.002474353316756,
      'canBeCalibrated': true,
      'rssi': -77,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    }];

    let currSGV = {
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528892489488,
      'filtered': 145.92,
      'unfiltered': 141.632,
      'glucose': 134,
      'trend': -7.334767687903413,
      'canBeCalibrated': true,
      'rssi': -79,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    };

    let lastCal = {
      intercept: 33.03,
      slope: 0.8
    };

    glucoseHist.push(currSGV);

    let noise = stats.calcSensorNoise(glucoseHist, lastCal);

    noise.should.be.greaterThan(0.02);
    noise.should.be.lessThan(0.03);
  });

  it('should not calculate Sensor Noise if not enough records', function() {

    let glucoseHist = [{
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528890389945,
      'filtered': 161.056,
      'unfiltered': 158.4,
      'glucose': 155,
      'trend': -3.9982585362819747,
      'canBeCalibrated': true,
      'rssi': -59,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    }, {
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528890689766,
      'filtered': 159.36,
      'unfiltered': 156.544,
      'glucose': 153,
      'trend': -3.9992534726850986,
      'canBeCalibrated': true,
      'rssi': -63,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    }];

    let currSGV = {
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528892489488,
      'filtered': 145.92,
      'unfiltered': 141.632,
      'glucose': 134,
      'trend': -7.334767687903413,
      'canBeCalibrated': true,
      'rssi': -79,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    };

    let lastCal = {
      intercept: 0,
      slope: 1.06
    };

    glucoseHist.push(currSGV);

    let noise = stats.calcSensorNoise(glucoseHist, lastCal);

    noise.should.equal(0);
  });
});
