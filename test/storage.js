/* global describe it */

const _ = require('lodash');
const store = require('node-persist');
const storage = require('./../storage');

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
