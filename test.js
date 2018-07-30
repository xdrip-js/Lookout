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
      'readDateMills': 1528890389945,
      'filtered': 161056,
      'unfiltered': 158400,
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
      'readDateMills': 1528890689766,
      'filtered': 159360,
      'unfiltered': 156544,
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
      'readDateMills': 1528890989467,
      'filtered': 157504,
      'unfiltered': 154432,
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
      'readDateMills': 1528891289963,
      'filtered': 155488,
      'unfiltered': 151872,
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
      'readDateMills': 1528891589664,
      'filtered': 153312,
      'unfiltered': 149984,
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
      'readDateMills': 1528891889576,
      'filtered': 151008,
      'unfiltered': 147264,
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
      'readDateMills': 1528892189592,
      'filtered': 148544,
      'unfiltered': 144256,
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
      'readDateMills': 1528892489488,
      'filtered': 145920,
      'unfiltered': 141632,
      'glucose': 134,
      'trend': -7.334767687903413,
      'canBeCalibrated': true,
      'rssi': -79,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    };

    let lastCal = calibration.calculateG5Calibration(null, 0, null, glucoseHist, currSGV);

    lastCal.slope.should.be.greaterThan(800);
    lastCal.slope.should.be.lessThan(900);
    lastCal.intercept.should.be.greaterThan(33500);
    lastCal.intercept.should.be.lessThan(33600);
    lastCal.type.should.equal('LeastSquaresRegression');
  });

  it('should not calculate Single Point calibration if not enough records', function() {

    let glucoseHist = [{
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528890389945,
      'readDateMills': 1528890389945,
      'filtered': 161056,
      'unfiltered': 158400,
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
      'readDateMills': 1528890689766,
      'filtered': 159360,
      'unfiltered': 156544,
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
      'readDateMills': 1528892489488,
      'filtered': 145920,
      'unfiltered': 141632,
      'glucose': 134,
      'trend': -7.334767687903413,
      'canBeCalibrated': true,
      'rssi': -79,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    };

    let lastCal = calibration.calculateG5Calibration(null, 0, null, glucoseHist, currSGV);

    lastCal.slope.should.be.greaterThan(1050);
    lastCal.slope.should.be.lessThan(1060);
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
      'readDateMills': 1528890389945,
      'filtered': 161056,
      'unfiltered': 158400,
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
      'readDateMills': 1528890689766,
      'filtered': 159360,
      'unfiltered': 156544,
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
      'readDateMills': 1528890989467,
      'filtered': 157504,
      'unfiltered': 154432,
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
      'readDateMills': 1528891289963,
      'filtered': 155488,
      'unfiltered': 151872,
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
      'readDateMills': 1528891589664,
      'filtered': 153312,
      'unfiltered': 149984,
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
      'readDateMills': 1528891889576,
      'filtered': 151008,
      'unfiltered': 147264,
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
      'readDateMills': 1528892189592,
      'filtered': 148544,
      'unfiltered': 144256,
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
      'readDateMills': 1528892489488,
      'filtered': 145920,
      'unfiltered': 141632,
      'glucose': 134,
      'trend': -7.334767687903413,
      'canBeCalibrated': true,
      'rssi': -79,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    };

    let lastCal = {
      intercept: 33550,
      slope: 1055
    };

    glucoseHist.push(currSGV);

    let noise = stats.calcSensorNoise(glucoseHist, lastCal);

    noise.should.be.greaterThan(0.016);
    noise.should.be.lessThan(0.017);
  });

  it('should not calculate Sensor Noise if not enough records', function() {

    let glucoseHist = [{
      'inSession': true,
      'status': 0,
      'state': 7,
      'readDate': 1528890389945,
      'readDateMills': 1528890389945,
      'filtered': 161056,
      'unfiltered': 158400,
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
      'readDateMills': 1528890689766,
      'filtered': 159360,
      'unfiltered': 156544,
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
      'readDateMills': 1528892489488,
      'filtered': 145920,
      'unfiltered': 141632,
      'glucose': 134,
      'trend': -7.334767687903413,
      'canBeCalibrated': true,
      'rssi': -79,
      'g5calibrated': true,
      'stateString': 'Need calibration',
    };

    let lastCal = {
      intercept: 0,
      slope: 1060
    };

    glucoseHist.push(currSGV);

    let noise = stats.calcSensorNoise(glucoseHist, lastCal);

    noise.should.equal(0);
  });

  it('should calculate glucose from calibration record', function() {

    let currSGV = {
      'readDate': 1528892489488,
      'readDateMills': 1528892489488,
      'filtered': 135920,
      'unfiltered': 131632,
    };

    let lastCal = {
      intercept: 30000,
      slope: 1060
    };

    let glucose = calibration.calcGlucose(currSGV, lastCal);

    glucose.should.equal(96);
  });

  it('should set glucose to 39 if calculated glucose is below 40', function() {

    let currSGV = {
      'readDate': 1528892489488,
      'readDateMills': 1528892489488,
      'filtered': 45920,
      'unfiltered': 31632,
    };

    let lastCal = {
      intercept: 0,
      slope: 1060
    };

    let glucose = calibration.calcGlucose(currSGV, lastCal);

    glucose.should.equal(39);
  });

});
