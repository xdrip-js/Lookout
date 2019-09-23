/* global describe it */

const should = require('should');
const moment = require('moment');

const calibration = require('./../calibration');


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

    const options = {
      min_lsr_pairs: 2,
      max_lsr_pairs: 10,
      max_lsr_pairs_age: 6,
    };

    const lastCal = calibration.calculateTxmitterCalibration(
      options, null, 0, null, null, glucoseHist, currSGV,
    );

    lastCal.slope.should.be.greaterThan(800);
    lastCal.slope.should.be.lessThan(810);
    lastCal.intercept.should.be.greaterThan(33500);
    lastCal.intercept.should.be.lessThan(33600);
    lastCal.type.should.equal('LeastSquaresRegression');
  });

  it('should not calculate calibration if not enough records', () => {
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

    const options = {
      min_lsr_pairs: 2,
      max_lsr_pairs: 10,
      max_lsr_pairs_age: 6,
    };

    const lastCal = calibration.calculateTxmitterCalibration(
      options, null, 0, null, null, glucoseHist, currSGV,
    );

    should.not.exist(lastCal);
  });

  it('should calculate expired calibration values with Least Squares Regression', async () => {
    const bgChecks = [
      {
        date: 1544133780000,
        dateMills: 1544133780000,
        glucose: 127,
        type: 'NS',
        unfiltered: 110298.86094477712,
        filtered: 110298.86094477712,
      },
      {
        date: 1544237557000,
        dateMills: 1544237557000,
        glucose: 130,
        type: 'NS',
        unfiltered: 113266.57133129044,
        filtered: 113266.57133129044,
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
      filtered: 101056,
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
      filtered: 108544,
      unfiltered: 108500,
      glucose: 106,
      trend: -6.002474353316756,
      canBeCalibrated: true,
      rssi: -77,
      g5calibrated: true,
      stateString: 'Need calibration',
    }];

    const options = {
      min_lsr_pairs: 2,
      max_lsr_pairs: 10,
      max_lsr_pairs_age: 6,
    };

    const lastCal = await calibration.expiredCalibration(
      options, null, bgChecks, null, null, glucoseHist, null,
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
        filtered: 110298.86094477712,
      },
      {
        date: 1544237557000,
        dateMills: 1544237557000,
        glucose: 130,
        type: 'NS',
        unfiltered: 113266.57133129044,
        filtered: 113266.57133129044,
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
      filtered: 106056,
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
      filtered: 108544,
      unfiltered: 108500,
      glucose: 106,
      trend: -6.002474353316756,
      canBeCalibrated: true,
      rssi: -77,
      g5calibrated: true,
      stateString: 'Need calibration',
    }];

    const options = {
      min_lsr_pairs: 2,
      max_lsr_pairs: 3,
      max_lsr_pairs_age: 6,
    };

    const lastCal = await calibration.expiredCalibration(
      options, null, bgChecks, null, null, glucoseHist, null,
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
        filtered: 110298.86094477712,
      },
      {
        date: 1544237557000,
        dateMills: 1544237557000,
        glucose: 130,
        type: 'NS',
        unfiltered: 113266.57133129044,
        filtered: 113266.57133129044,
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
      filtered: 101056,
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
      filtered: 108544,
      unfiltered: 108500,
      glucose: 106,
      trend: -6.002474353316756,
      canBeCalibrated: true,
      rssi: -77,
      g5calibrated: true,
      stateString: 'Need calibration',
    }];

    const options = {
      min_lsr_pairs: 5,
      max_lsr_pairs: 10,
      max_lsr_pairs_age: 6,
    };

    const lastCal = await calibration.expiredCalibration(
      options, null, bgChecks, null, null, glucoseHist, null,
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
        filtered: 110298.86094477712,
      },
      {
        date: 1544237557000,
        dateMills: 1544237557000,
        glucose: 130,
        type: 'NS',
        unfiltered: 113266.57133129044,
        filtered: 113266.57133129044,
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
      filtered: 101056,
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
      filtered: 108544,
      unfiltered: 108500,
      glucose: 106,
      trend: -6.002474353316756,
      canBeCalibrated: true,
      rssi: -77,
      g5calibrated: true,
      stateString: 'Need calibration',
    }];

    const options = {
      min_lsr_pairs: 2,
      max_lsr_pairs: 10,
      max_lsr_pairs_age: 2,
    };

    const lastCal = await calibration.expiredCalibration(
      options, null, bgChecks, null, null, glucoseHist, null,
    );

    lastCal.type.should.equal('LeastSquaresRegression');
    lastCal.slope.should.be.within(1050, 1060);
    lastCal.intercept.should.be.within(-24000, -23000);
  });

  it('should ignore glucose records with filtered and unfiltered > 10% apart', async () => {
    const bgChecks = [
      {
        date: 1544133780000,
        dateMills: 1544133780000,
        glucose: 127,
        type: 'NS',
        unfiltered: 110298.86094477712,
        filtered: 110298.86094477712,
      },
      {
        date: 1544237557000,
        dateMills: 1544237557000,
        glucose: 130,
        type: 'NS',
        unfiltered: 113266.57133129044,
        filtered: 113266.57133129044,
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

    const options = {
      min_lsr_pairs: 2,
      max_lsr_pairs: 10,
      max_lsr_pairs_age: 2,
    };

    const lastCal = await calibration.expiredCalibration(
      options, null, bgChecks, null, null, glucoseHist, null,
    );

    lastCal.type.should.equal('LeastSquaresRegression');
    lastCal.slope.should.be.within(989, 990);
    lastCal.intercept.should.be.within(-15335, -15334);
  });

  it('should calculate Single Point during warmup', async () => {
    const bgChecks = [
      {
        date: 1569159944000,
        dateMills: 1569159944000,
        glucose: 235,
        type: 'NS',
        unfiltered: 152880.59868282842,
        filtered: 152880.59868282842,
      }, {
        date: 1569162968000,
        dateMills: 1569162968000,
        glucose: 245,
        type: 'NS',
        unfiltered: 156040.64327247645,
        filtered: 156040.64327247645,
      },
    ];

    //  const sensorStop = {
    //    date: moment(1569156662680),
    //    notes: '',
    //  };

    //  const sensorStart = {
    //    date: moment(1569156662680),
    //    notes: '',
    //  };

    const sensorInsert = {
      date: moment(1569157335674),
    };

    const glucoseHist = [
      {
        inSession: true,
        glucoseMessage: {
          status: 0,
          sequence: 1,
          timestamp: 901,
          glucoseIsDisplayOnly: false,
          glucose: 5,
          state: 2,
          trend: 127,
        },
        timeMessage: {
          status: 0,
          currentTime: 905,
          sessionStartTime: 331,
        },
        status: 0,
        state: 2,
        transmitterStartDate: '2019-09-22T13:27:52.388Z',
        sessionStartDate: '2019-09-22T13:33:23.388Z',
        readDate: '2019-09-22T13:42:53.388Z',
        isDisplayOnly: false,
        filtered: 153152,
        unfiltered: 153536,
        glucose: null,
        trend: 0.9997767165333076,
        canBeCalibrated: false,
        rssi: -56,
        readDateMills: 1569159773388,
        voltagea: 313,
        voltageb: 288,
        voltageTime: 1569159177446,
        temperature: 34,
        resistance: 1477,
        g5calibrated: true,
        inExtendedSession: false,
        inExpiredSession: false,
        noise: 0.4,
        nsNoise: 2,
        noiseString: 'Light',
        mode: 'txmitter cal',
        stateString: 'Warmup',
        stateStringShort: 'Warmup',
        txStatusString: 'OK',
        txStatusStringShort: 'OK',
        inNS: true,
      }, {
        inSession: true,
        glucoseMessage: {
          status: 0,
          sequence: 3,
          timestamp: 1501,
          glucoseIsDisplayOnly: false,
          glucose: 5,
          state: 2,
          trend: 127,
        },
        timeMessage: {
          status: 0,
          currentTime: 1506,
          sessionStartTime: 331,
        },
        status: 0,
        state: 2,
        transmitterStartDate: '2019-09-22T13:27:52.158Z',
        sessionStartDate: '2019-09-22T13:33:23.158Z',
        readDate: '2019-09-22T13:52:53.158Z',
        isDisplayOnly: false,
        filtered: 153120,
        unfiltered: 151232,
        glucose: null,
        trend: -3.0011504410023844,
        canBeCalibrated: false,
        rssi: -80,
        readDateMills: 1569160373158,
        voltagea: 313,
        voltageb: 288,
        voltageTime: 1569159177446,
        temperature: 34,
        resistance: 1477,
        g5calibrated: true,
        inExtendedSession: false,
        inExpiredSession: false,
        noise: 0.4,
        nsNoise: 2,
        noiseString: 'Light',
        mode: 'txmitter cal',
        stateString: 'Warmup',
        stateStringShort: 'Warmup',
        txStatusString: 'OK',
        txStatusStringShort: 'OK',
      }, {
        inSession: true,
        glucoseMessage: {
          status: 0,
          sequence: 5,
          timestamp: 2101,
          glucoseIsDisplayOnly: false,
          glucose: 5,
          state: 2,
          trend: 127,
        },
        timeMessage: {
          status: 0,
          currentTime: 2105,
          sessionStartTime: 331,
        },
        status: 0,
        state: 2,
        transmitterStartDate: '2019-09-22T13:27:52.690Z',
        sessionStartDate: '2019-09-22T13:33:23.690Z',
        readDate: '2019-09-22T14:02:53.690Z',
        isDisplayOnly: false,
        filtered: 149952,
        unfiltered: 146816,
        glucose: null,
        trend: -3.9964564752586034,
        canBeCalibrated: false,
        rssi: -69,
        readDateMills: 1569160973690,
        voltagea: 313,
        voltageb: 287,
        voltageTime: 1569160977851,
        temperature: 33,
        resistance: 1513,
        g5calibrated: true,
        inExtendedSession: false,
        inExpiredSession: false,
        noise: 0.4,
        nsNoise: 2,
        noiseString: 'Light',
        mode: 'txmitter cal',
        stateString: 'Warmup',
        stateStringShort: 'Warmup',
        txStatusString: 'OK',
        txStatusStringShort: 'OK',
        inNS: true,
      }, {
        inSession: true,
        glucoseMessage: {
          status: 0,
          sequence: 6,
          timestamp: 2401,
          glucoseIsDisplayOnly: false,
          glucose: 5,
          state: 2,
          trend: 127,
        },
        timeMessage: {
          status: 0,
          currentTime: 2405,
          sessionStartTime: 331,
        },
        status: 0,
        state: 2,
        transmitterStartDate: '2019-09-22T13:27:52.376Z',
        sessionStartDate: '2019-09-22T13:33:23.376Z',
        readDate: '2019-09-22T14:07:53.376Z',
        isDisplayOnly: false,
        filtered: 147840,
        unfiltered: 147168,
        glucose: null,
        trend: -2.6660208971604655,
        canBeCalibrated: false,
        rssi: -68,
        readDateMills: 1569161273376,
        voltagea: 313,
        voltageb: 287,
        voltageTime: 1569160977851,
        temperature: 33,
        resistance: 1513,
        g5calibrated: true,
        inExtendedSession: false,
        inExpiredSession: false,
        noise: 0.4,
        nsNoise: 2,
        noiseString: 'Light',
        mode: 'txmitter cal',
        stateString: 'Warmup',
        stateStringShort: 'Warmup',
        txStatusString: 'OK',
        txStatusStringShort: 'OK',
        inNS: true,
      }, {
        inSession: true,
        glucoseMessage: {
          status: 0,
          sequence: 7,
          timestamp: 2701,
          glucoseIsDisplayOnly: false,
          glucose: 5,
          state: 2,
          trend: 127,
        },
        timeMessage: {
          status: 0,
          currentTime: 2705,
          sessionStartTime: 331,
        },
        status: 0,
        state: 2,
        transmitterStartDate: '2019-09-22T13:27:52.391Z',
        sessionStartDate: '2019-09-22T13:33:23.391Z',
        readDate: '2019-09-22T14:12:53.391Z',
        isDisplayOnly: false,
        filtered: 146496,
        unfiltered: 146784,
        glucose: null,
        trend: 0,
        canBeCalibrated: false,
        rssi: -68,
        readDateMills: 1569161573391,
        voltagea: 313,
        voltageb: 287,
        voltageTime: 1569160977851,
        temperature: 33,
        resistance: 1513,
        g5calibrated: true,
        inExtendedSession: false,
        inExpiredSession: false,
        noise: 0.4,
        nsNoise: 2,
        noiseString: 'Light',
        mode: 'txmitter cal',
        stateString: 'Warmup',
        stateStringShort: 'Warmup',
        txStatusString: 'OK',
        txStatusStringShort: 'OK',
        inNS: true,
      }, {
        inSession: true,
        glucoseMessage: {
          status: 0,
          sequence: 8,
          timestamp: 3001,
          glucoseIsDisplayOnly: false,
          glucose: 5,
          state: 2,
          trend: 127,
        },
        timeMessage: {
          status: 0,
          currentTime: 3005,
          sessionStartTime: 331,
        },
        status: 0,
        state: 2,
        transmitterStartDate: '2019-09-22T13:27:52.273Z',
        sessionStartDate: '2019-09-22T13:33:23.273Z',
        readDate: '2019-09-22T14:17:53.273Z',
        isDisplayOnly: false,
        filtered: 146176,
        unfiltered: 145984,
        glucose: null,
        trend: -0.6669756987404164,
        canBeCalibrated: false,
        rssi: -73,
        readDateMills: 1569161873273,
        voltagea: 313,
        voltageb: 287,
        voltageTime: 1569160977851,
        temperature: 33,
        resistance: 1513,
        g5calibrated: true,
        inExtendedSession: false,
        inExpiredSession: false,
        noise: 0.4,
        nsNoise: 2,
        noiseString: 'Light',
        mode: 'txmitter cal',
        stateString: 'Warmup',
        stateStringShort: 'Warmup',
        txStatusString: 'OK',
        txStatusStringShort: 'OK',
        inNS: true,
      }, {
        inSession: true,
        glucoseMessage: {
          status: 0,
          sequence: 9,
          timestamp: 3301,
          glucoseIsDisplayOnly: false,
          glucose: 5,
          state: 2,
          trend: 127,
        },
        timeMessage: {
          status: 0,
          currentTime: 3305,
          sessionStartTime: 331,
        },
        status: 0,
        state: 2,
        transmitterStartDate: '2019-09-22T13:27:52.443Z',
        sessionStartDate: '2019-09-22T13:33:23.443Z',
        readDate: '2019-09-22T14:22:53.443Z',
        isDisplayOnly: false,
        filtered: 146560,
        unfiltered: 148384,
        glucose: null,
        trend: 0.6666170407314123,
        canBeCalibrated: false,
        rssi: -78,
        readDateMills: 1569162173443,
        voltagea: 313,
        voltageb: 287,
        voltageTime: 1569160977851,
        temperature: 33,
        resistance: 1513,
        g5calibrated: true,
        inExtendedSession: false,
        inExpiredSession: false,
        noise: 0.4,
        nsNoise: 2,
        noiseString: 'Light',
        mode: 'txmitter cal',
        stateString: 'Warmup',
        stateStringShort: 'Warmup',
        txStatusString: 'OK',
        txStatusStringShort: 'OK',
        inNS: true,
      }, {
        inSession: true,
        glucoseMessage: {
          status: 0,
          sequence: 10,
          timestamp: 3601,
          glucoseIsDisplayOnly: false,
          glucose: 5,
          state: 2,
          trend: 127,
        },
        timeMessage: {
          status: 0,
          currentTime: 3605,
          sessionStartTime: 331,
        },
        status: 0,
        state: 2,
        transmitterStartDate: '2019-09-22T13:27:52.456Z',
        sessionStartDate: '2019-09-22T13:33:23.456Z',
        readDate: '2019-09-22T14:27:53.456Z',
        isDisplayOnly: false,
        filtered: 147392,
        unfiltered: 150016,
        glucose: null,
        trend: 1.9998555659869008,
        canBeCalibrated: false,
        rssi: -70,
        readDateMills: 1569162473456,
        voltagea: 313,
        voltageb: 287,
        voltageTime: 1569160977851,
        temperature: 33,
        resistance: 1513,
        g5calibrated: true,
        inExtendedSession: false,
        inExpiredSession: false,
        noise: 0.4,
        nsNoise: 2,
        noiseString: 'Light',
        mode: 'txmitter cal',
        stateString: 'Warmup',
        stateStringShort: 'Warmup',
        txStatusString: 'OK',
        txStatusStringShort: 'OK',
        inNS: true,
      }, {
        inSession: true,
        glucoseMessage: {
          status: 0,
          sequence: 11,
          timestamp: 3901,
          glucoseIsDisplayOnly: false,
          glucose: 5,
          state: 2,
          trend: 127,
        },
        timeMessage: {
          status: 0,
          currentTime: 3905,
          sessionStartTime: 331,
        },
        status: 0,
        state: 2,
        transmitterStartDate: '2019-09-22T13:27:52.353Z',
        sessionStartDate: '2019-09-22T13:33:23.353Z',
        readDate: '2019-09-22T14:32:53.353Z',
        isDisplayOnly: false,
        filtered: 149184,
        unfiltered: 155968,
        glucose: null,
        trend: 6.66607412674429,
        canBeCalibrated: false,
        rssi: -58,
        readDateMills: 1569162773353,
        voltagea: 313,
        voltageb: 288,
        voltageTime: 1569162777682,
        temperature: 34,
        resistance: 1494,
        g5calibrated: true,
        inExtendedSession: false,
        inExpiredSession: false,
        noise: 0.4,
        nsNoise: 2,
        noiseString: 'Light',
        mode: 'txmitter cal',
        stateString: 'Warmup',
        stateStringShort: 'Warmup',
        txStatusString: 'OK',
        txStatusStringShort: 'OK',
        inNS: true,
      }, {
        inSession: true,
        glucoseMessage: {
          status: 0,
          sequence: 13,
          timestamp: 4501,
          glucoseIsDisplayOnly: false,
          glucose: 5,
          state: 2,
          trend: 127,
        },
        timeMessage: {
          status: 0,
          currentTime: 4505,
          sessionStartTime: 331,
        },
        status: 0,
        state: 2,
        transmitterStartDate: '2019-09-22T13:27:52.559Z',
        sessionStartDate: '2019-09-22T13:33:23.559Z',
        readDate: '2019-09-22T14:42:53.559Z',
        isDisplayOnly: false,
        filtered: 155968,
        unfiltered: 156192,
        glucose: null,
        trend: 3.999542274606351,
        canBeCalibrated: false,
        rssi: -73,
        readDateMills: 1569163373559,
        voltagea: 313,
        voltageb: 288,
        voltageTime: 1569162777682,
        temperature: 34,
        resistance: 1494,
        g5calibrated: true,
        inExtendedSession: false,
        inExpiredSession: false,
        noise: 0.4,
        nsNoise: 2,
        noiseString: 'Light',
        mode: 'txmitter cal',
        stateString: 'Warmup',
        stateStringShort: 'Warmup',
        txStatusString: 'OK',
        txStatusStringShort: 'OK',
        inNS: true,
      }, {
        inSession: true,
        glucoseMessage: {
          status: 0,
          sequence: 14,
          timestamp: 4801,
          glucoseIsDisplayOnly: false,
          glucose: 5,
          state: 2,
          trend: 127,
        },
        timeMessage: {
          status: 0,
          currentTime: 4805,
          sessionStartTime: 331,
        },
        status: 0,
        state: 2,
        transmitterStartDate: '2019-09-22T13:27:52.466Z',
        sessionStartDate: '2019-09-22T13:33:23.466Z',
        readDate: '2019-09-22T14:47:53.466Z',
        isDisplayOnly: false,
        filtered: 158144,
        unfiltered: 156352,
        glucose: null,
        trend: 0,
        canBeCalibrated: false,
        rssi: -63,
        readDateMills: 1569163673466,
        voltagea: 313,
        voltageb: 288,
        voltageTime: 1569162777682,
        temperature: 34,
        resistance: 1494,
        g5calibrated: true,
        inExtendedSession: false,
        inExpiredSession: false,
        noise: 0.4,
        nsNoise: 2,
        noiseString: 'Light',
        mode: 'txmitter cal',
        stateString: 'Warmup',
        stateStringShort: 'Warmup',
        txStatusString: 'OK',
        txStatusStringShort: 'OK',
      },
    ];

    const options = {
      min_lsr_pairs: 5,
      max_lsr_pairs: 10,
      max_lsr_pairs_age: 6,
    };

    const lastCal = await calibration.expiredCalibration(
      options, null, bgChecks, null, sensorInsert, glucoseHist, null,
    );

    lastCal.type.should.equal('SinglePoint');
    lastCal.slope.should.be.within(636, 637);
    lastCal.intercept.should.equal(0);
  });
});
