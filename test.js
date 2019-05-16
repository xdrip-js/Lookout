/* global describe it */

require('should');

const _ = require('lodash');
const store = require('node-persist');
const stats = require('./calcStats');
const calibration = require('./calibration');
const storage = require('./storage');

describe('Test Calibration', () => {
  it('should calculate Dexcom calibration values with Least Squares Regression', () => {
    const glucoseHist = [{
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528890389945,
      readDateMills: 1528890389945,
      filtered: 161056,
      unfiltered: 158400,
      glucose: 155,
      trend: -3.9982585362819747,
      canBeCalibrated: true,
      rssi: -59,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528890689766,
      readDateMills: 1528890689766,
      filtered: 159360,
      unfiltered: 156544,
      glucose: 153,
      trend: -3.9992534726850986,
      canBeCalibrated: true,
      rssi: -63,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528890989467,
      readDateMills: 1528890989467,
      filtered: 157504,
      unfiltered: 154432,
      glucose: 150,
      trend: -4.667973699302471,
      canBeCalibrated: true,
      rssi: -55,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528891289963,
      readDateMills: 1528891289963,
      filtered: 155488,
      unfiltered: 151872,
      glucose: 147,
      trend: -5.3332266687999565,
      canBeCalibrated: true,
      rssi: -80,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528891589664,
      readDateMills: 1528891589664,
      filtered: 153312,
      unfiltered: 149984,
      glucose: 145,
      trend: -5.333937846289246,
      canBeCalibrated: true,
      rssi: -82,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528891889576,
      readDateMills: 1528891889576,
      filtered: 151008,
      unfiltered: 147264,
      glucose: 141,
      trend: -5.999273421330083,
      canBeCalibrated: true,
      rssi: -79,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528892189592,
      readDateMills: 1528892189592,
      filtered: 148544,
      unfiltered: 144256,
      glucose: 138,
      trend: -6.002474353316756,
      canBeCalibrated: true,
      rssi: -77,
      g5calibrated: true,
      stateString: 'Need calibration',
    }];

    const currSGV = {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528892489488,
      readDateMills: 1528892489488,
      filtered: 145920,
      unfiltered: 141632,
      glucose: 134,
      trend: -7.334767687903413,
      canBeCalibrated: true,
      rssi: -79,
      g5calibrated: true,
      stateString: 'Need calibration',
    };

    const lastCal = calibration.calculateTxmitterCalibration(
      null, 0, null, null, glucoseHist, currSGV,
    );

    lastCal.slope.should.be.greaterThan(800);
    lastCal.slope.should.be.lessThan(810);
    lastCal.intercept.should.be.greaterThan(33500);
    lastCal.intercept.should.be.lessThan(33600);
    lastCal.type.should.equal('LeastSquaresRegression');
  });

  it('should calculate Single Point calibration if not enough records', () => {
    const glucoseHist = [{
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528890389945,
      readDateMills: 1528890389945,
      filtered: 161056,
      unfiltered: 158400,
      glucose: 155,
      trend: -3.9982585362819747,
      canBeCalibrated: true,
      rssi: -59,
      g5calibrated: true,
      stateString: 'Need calibration',
    }];

    const currSGV = {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528892489488,
      readDateMills: 1528892489488,
      filtered: 145920,
      unfiltered: 141632,
      glucose: 134,
      trend: -7.334767687903413,
      canBeCalibrated: true,
      rssi: -79,
      g5calibrated: true,
      stateString: 'Need calibration',
    };

    const lastCal = calibration.calculateTxmitterCalibration(
      null, 0, null, null, glucoseHist, currSGV,
    );

    lastCal.slope.should.be.greaterThan(1050);
    lastCal.slope.should.be.lessThan(1060);
    lastCal.intercept.should.equal(0);
    lastCal.type.should.equal('SinglePoint');
  });

  it('should calculate expired calibration values with Least Squares Regression', async () => {
    const bgChecks = [
      {
        date: 1544133780000,
        dateMills: 1544133780000,
        glucose: 127,
        type: 'NS',
        unfiltered: 110298.86094477712,
      },
      {
        date: 1544237557000,
        dateMills: 1544237557000,
        glucose: 130,
        type: 'NS',
        unfiltered: 113266.57133129044,
      },
      {
        date: 1544391573000,
        dateMills: 1544391573000,
        glucose: 125,
        type: 'NS',
      },
    ];

    const glucoseHist = [{
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1544391333000,
      readDateMills: 1544391333000,
      filtered: 161056,
      unfiltered: 106000,
      glucose: 105,
      trend: -3.9982585362819747,
      canBeCalibrated: true,
      rssi: -59,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1544391633000,
      readDateMills: 1544391633000,
      filtered: 148544,
      unfiltered: 108500,
      glucose: 106,
      trend: -6.002474353316756,
      canBeCalibrated: true,
      rssi: -77,
      g5calibrated: true,
      stateString: 'Need calibration',
    }];

    const lastCal = await calibration.expiredCalibration(
      { }, null, bgChecks, null, null, glucoseHist, null,
    );

    lastCal.type.should.equal('LeastSquaresRegression');
    lastCal.slope.should.be.within(1045, 1055);
    lastCal.intercept.should.be.within(-24000, -23000);
  });

  it('should calculate expired calibration using max_lsr_pairs option', async () => {
    const bgChecks = [
      {
        date: 1544133780000,
        dateMills: 1544133780000,
        glucose: 127,
        type: 'NS',
        unfiltered: 110298.86094477712,
      },
      {
        date: 1544237557000,
        dateMills: 1544237557000,
        glucose: 130,
        type: 'NS',
        unfiltered: 113266.57133129044,
      },
      {
        date: 1544391573000,
        dateMills: 1544391573000,
        glucose: 125,
        type: 'NS',
      },
    ];

    const glucoseHist = [{
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1544391333000,
      readDateMills: 1544391333000,
      filtered: 161056,
      unfiltered: 106000,
      glucose: 105,
      trend: -3.9982585362819747,
      canBeCalibrated: true,
      rssi: -59,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1544391633000,
      readDateMills: 1544391633000,
      filtered: 148544,
      unfiltered: 108500,
      glucose: 106,
      trend: -6.002474353316756,
      canBeCalibrated: true,
      rssi: -77,
      g5calibrated: true,
      stateString: 'Need calibration',
    }];

    const lastCal = await calibration.expiredCalibration(
      { max_lsr_pairs: 3 }, null, bgChecks, null, null, glucoseHist, null,
    );

    lastCal.type.should.equal('LeastSquaresRegression');
    lastCal.slope.should.be.within(1050, 1060);
    lastCal.intercept.should.be.within(-24000, -23000);
  });

  it('should calculate expired calibration using min_lsr_pairs option', async () => {
    const bgChecks = [
      {
        date: 1544133780000,
        dateMills: 1544133780000,
        glucose: 127,
        type: 'NS',
        unfiltered: 110298.86094477712,
      },
      {
        date: 1544237557000,
        dateMills: 1544237557000,
        glucose: 130,
        type: 'NS',
        unfiltered: 113266.57133129044,
      },
      {
        date: 1544391573000,
        dateMills: 1544391573000,
        glucose: 125,
        type: 'NS',
      },
    ];

    const glucoseHist = [{
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1544391333000,
      readDateMills: 1544391333000,
      filtered: 161056,
      unfiltered: 106000,
      glucose: 105,
      trend: -3.9982585362819747,
      canBeCalibrated: true,
      rssi: -59,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1544391633000,
      readDateMills: 1544391633000,
      filtered: 148544,
      unfiltered: 108500,
      glucose: 106,
      trend: -6.002474353316756,
      canBeCalibrated: true,
      rssi: -77,
      g5calibrated: true,
      stateString: 'Need calibration',
    }];

    const lastCal = await calibration.expiredCalibration(
      { min_lsr_pairs: 5 }, null, bgChecks, null, null, glucoseHist, null,
    );

    lastCal.type.should.equal('SinglePoint');
    lastCal.slope.should.be.within(860, 870);
    lastCal.intercept.should.equal(0);
  });

  it('should calculate expired calibration using max_lsr_pairs option', async () => {
    const bgChecks = [
      {
        date: 1544133780000,
        dateMills: 1544133780000,
        glucose: 127,
        type: 'NS',
        unfiltered: 110298.86094477712,
      },
      {
        date: 1544237557000,
        dateMills: 1544237557000,
        glucose: 130,
        type: 'NS',
        unfiltered: 113266.57133129044,
      },
      {
        date: 1544391573000,
        dateMills: 1544391573000,
        glucose: 125,
        type: 'NS',
      },
    ];

    const glucoseHist = [{
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1544391333000,
      readDateMills: 1544391333000,
      filtered: 161056,
      unfiltered: 106000,
      glucose: 105,
      trend: -3.9982585362819747,
      canBeCalibrated: true,
      rssi: -59,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1544391633000,
      readDateMills: 1544391633000,
      filtered: 148544,
      unfiltered: 108500,
      glucose: 106,
      trend: -6.002474353316756,
      canBeCalibrated: true,
      rssi: -77,
      g5calibrated: true,
      stateString: 'Need calibration',
    }];

    const lastCal = await calibration.expiredCalibration(
      { max_lsr_pairs_age: 2 }, null, bgChecks, null, null, glucoseHist, null,
    );

    lastCal.type.should.equal('LeastSquaresRegression');
    lastCal.slope.should.be.within(1050, 1060);
    lastCal.intercept.should.be.within(-24000, -23000);
  });
});

describe('Test Stats', () => {
  it('should calculate Sensor Noise', () => {
    const glucoseHist = [{
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528890389945,
      readDateMills: 1528890389945,
      filtered: 161056,
      unfiltered: 158400,
      glucose: 155,
      trend: -3.9982585362819747,
      canBeCalibrated: true,
      rssi: -59,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528890689766,
      readDateMills: 1528890689766,
      filtered: 159360,
      unfiltered: 156544,
      glucose: 153,
      trend: -3.9992534726850986,
      canBeCalibrated: true,
      rssi: -63,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528890989467,
      readDateMills: 1528890989467,
      filtered: 157504,
      unfiltered: 154432,
      glucose: 150,
      trend: -4.667973699302471,
      canBeCalibrated: true,
      rssi: -55,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528891289963,
      readDateMills: 1528891289963,
      filtered: 155488,
      unfiltered: 151872,
      glucose: 147,
      trend: -5.3332266687999565,
      canBeCalibrated: true,
      rssi: -80,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528891589664,
      readDateMills: 1528891589664,
      filtered: 153312,
      unfiltered: 149984,
      glucose: 145,
      trend: -5.333937846289246,
      canBeCalibrated: true,
      rssi: -82,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528891889576,
      readDateMills: 1528891889576,
      filtered: 151008,
      unfiltered: 147264,
      glucose: 141,
      trend: -5.999273421330083,
      canBeCalibrated: true,
      rssi: -79,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528892189592,
      readDateMills: 1528892189592,
      filtered: 148544,
      unfiltered: 144256,
      glucose: 138,
      trend: -6.002474353316756,
      canBeCalibrated: true,
      rssi: -77,
      g5calibrated: true,
      stateString: 'Need calibration',
    }];

    const currSGV = {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528892489488,
      readDateMills: 1528892489488,
      filtered: 145920,
      unfiltered: 141632,
      glucose: 134,
      trend: -7.334767687903413,
      canBeCalibrated: true,
      rssi: -79,
      g5calibrated: true,
      stateString: 'Need calibration',
    };

    const lastCal = {
      intercept: 33550,
      slope: 1055,
    };

    glucoseHist.push(currSGV);

    const noise = stats.calcSensorNoise(calibration.calcGlucose, glucoseHist, lastCal);

    noise.should.be.greaterThan(0.016);
    noise.should.be.lessThan(0.017);
  });

  it('should not calculate Sensor Noise if not enough records', () => {
    const glucoseHist = [{
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528890389945,
      readDateMills: 1528890389945,
      filtered: 161056,
      unfiltered: 158400,
      glucose: 155,
      trend: -3.9982585362819747,
      canBeCalibrated: true,
      rssi: -59,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528890689766,
      readDateMills: 1528890689766,
      filtered: 159360,
      unfiltered: 156544,
      glucose: 153,
      trend: -3.9992534726850986,
      canBeCalibrated: true,
      rssi: -63,
      g5calibrated: true,
      stateString: 'Need calibration',
    }];

    const currSGV = {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528892489488,
      readDateMills: 1528892489488,
      filtered: 145920,
      unfiltered: 141632,
      glucose: 134,
      trend: -7.334767687903413,
      canBeCalibrated: true,
      rssi: -79,
      g5calibrated: true,
      stateString: 'Need calibration',
    };

    const lastCal = {
      intercept: 0,
      slope: 1060,
    };

    glucoseHist.push(currSGV);

    const noise = stats.calcSensorNoise(calibration.calcGlucose, glucoseHist, lastCal);

    noise.should.equal(0);
  });

  it('should calculate glucose from calibration record', () => {
    const currSGV = {
      readDate: 1528892489488,
      readDateMills: 1528892489488,
      filtered: 135920,
      unfiltered: 131632,
    };

    const lastCal = {
      intercept: 30000,
      slope: 1060,
    };

    const glucose = calibration.calcGlucose(currSGV, lastCal);

    glucose.should.equal(96);
  });

  it('should set glucose to 39 if calculated glucose is below 40', () => {
    const currSGV = {
      readDate: 1528892489488,
      readDateMills: 1528892489488,
      filtered: 45920,
      unfiltered: 31632,
    };

    const lastCal = {
      intercept: 0,
      slope: 1060,
    };

    const glucose = calibration.calcGlucose(currSGV, lastCal);

    glucose.should.equal(39);
  });
});

describe('Test Storage', () => {
  it('should initialize', async () => {
    await store.init({ dir: `${__dirname}/storage` });

    await storage.init(store);
  });

  it('should store items', async () => {
    const glucoseHist = [{
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528890389945,
      readDateMills: 1528890389945,
      filtered: 161056,
      unfiltered: 158400,
      glucose: 155,
      trend: -3.9982585362819747,
      canBeCalibrated: true,
      rssi: -59,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528890689766,
      readDateMills: 1528890689766,
      filtered: 159360,
      unfiltered: 156544,
      glucose: 153,
      trend: -3.9992534726850986,
      canBeCalibrated: true,
      rssi: -63,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528890989467,
      readDateMills: 1528890989467,
      filtered: 157504,
      unfiltered: 154432,
      glucose: 150,
      trend: -4.667973699302471,
      canBeCalibrated: true,
      rssi: -55,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528891289963,
      readDateMills: 1528891289963,
      filtered: 155488,
      unfiltered: 151872,
      glucose: 147,
      trend: -5.3332266687999565,
      canBeCalibrated: true,
      rssi: -80,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528891589664,
      readDateMills: 1528891589664,
      filtered: 153312,
      unfiltered: 149984,
      glucose: 145,
      trend: -5.333937846289246,
      canBeCalibrated: true,
      rssi: -82,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528891889576,
      readDateMills: 1528891889576,
      filtered: 151008,
      unfiltered: 147264,
      glucose: 141,
      trend: -5.999273421330083,
      canBeCalibrated: true,
      rssi: -79,
      g5calibrated: true,
      stateString: 'Need calibration',
    }, {
      inSession: true,
      status: 0,
      state: 7,
      readDate: 1528892189592,
      readDateMills: 1528892189592,
      filtered: 148544,
      unfiltered: 144256,
      glucose: 138,
      trend: -6.002474353316756,
      canBeCalibrated: true,
      rssi: -77,
      g5calibrated: true,
      stateString: 'Need calibration',
    }];

    storage.setItem('test1', glucoseHist);

    const hist = await storage.getItem('test1');

    _.isEqual(glucoseHist, hist).should.equal(true);
  });

  it('should return empty arrays on no object', async () => {
    const item = await storage.getArray('test2');

    item.length.should.equal(0);
  });
});
