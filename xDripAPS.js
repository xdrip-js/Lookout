// const http = require("http");
const os = require('os');
const request = require('request');
const requestPromise = require('request-promise-native');
const moment = require('moment');

const Debug = require('debug');

const log = Debug('xDripAPS:log');
const error = Debug('xDripAPS:error');
const debug = Debug('xDripAPS:debug');

const convertEntryToNS = (glucose) => {
  let direction;
  let sgv = glucose.glucose;

  if (glucose.trend <= -30) {
    direction = 'DoubleDown';
  } else if (glucose.trend <= -20) {
    direction = 'SingleDown';
  } else if (glucose.trend <= -10) {
    direction = 'FortyFiveDown';
  } else if (glucose.trend < 10) {
    direction = 'Flat';
  } else if (glucose.trend < 20) {
    direction = 'FortyFiveUp';
  } else if (glucose.trend < 30) {
    direction = 'SingleUp';
  } else {
    direction = 'DoubleUp';
  }

  if (!sgv) {
    // Set to 5 so NS will plot the unfiltered glucose values
    sgv = 5;
  }

  log(`Glucose: ${sgv} Time: ${moment(glucose.readDateMills).format()} Trend: ${Math.round(glucose.trend * 10) / 10} direction: ${direction}`);

  return {
    device: `xdripjs://${os.hostname()}`,
    date: glucose.readDateMills,
    dateString: new Date(glucose.readDateMills).toISOString(),
    sgv,
    direction,
    type: 'sgv',
    filtered: glucose.filtered,
    unfiltered: glucose.unfiltered,
    rssi: glucose.rssi,
    noise: glucose.nsNoise,
    trend: glucose.trend,
    glucose: sgv,
  };
};

const convertEntryToxDrip = glucose => ({
  readDateMills: glucose.date,
  readDate: glucose.dateString,
  filtered: glucose.filtered,
  unfiltered: glucose.unfiltered,
  rssi: glucose.rssi,
  nsNoise: glucose.noise,
  trend: glucose.trend,
  glucose: glucose.glucose,
});


const postToXdrip = (entry) => {
  const secret = process.env.API_SECRET;

  const optionsX = {
    url: 'http://127.0.0.1:5000/api/v1/entries',
    timeout: 30 * 1000,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'API-SECRET': secret,
    },
    body: entry,
    json: true,
  };

  /* eslint-disable-next-line no-unused-vars */
  request(optionsX, (err, response, body) => {
    if (err) {
      error('error posting SGV to xDripAPS: ', err);
    } else {
      log(`uploaded SGV to xDripAPS, statusCode = ${response.statusCode}`);
      debug('Entry:\n%O', entry);
    }
  });
};

const postToNS = (entry) => {
  const secret = process.env.API_SECRET;
  let nsUrl = `${process.env.NIGHTSCOUT_HOST}/api/v1/entries.json`;
  const nsHeaders = {
    'Content-Type': 'application/json',
  };

  if (secret.startsWith('token=')) {
    nsUrl = `${nsUrl}?${secret}`;
  } else {
    nsHeaders['API-SECRET'] = secret;
  }

  const optionsNS = {
    url: nsUrl,
    timeout: 30 * 1000,
    method: 'POST',
    headers: nsHeaders,
    body: entry,
    json: true,
  };

  /* eslint-disable-next-line no-unused-vars */
  request(optionsNS, (err, response, body) => {
    if (err) {
      error('error posting SGV to NS: ', err);
    } else {
      log(`uploaded SGV to NS, statusCode = ${response.statusCode}`);
      debug('Entry:\n%O', entry);
    }
  });
};

const queryLatestCal = () => {
  const secret = process.env.API_SECRET;
  let nsUrl = `${process.env.NIGHTSCOUT_HOST}/api/v1/entries.json?`;

  // time format needs to match the output of 'date -d "3 hours ago" -Iminutes -u'
  const nsQuery = 'find[type]=cal&count=1';

  const nsHeaders = {
    'Content-Type': 'application/json',
  };

  if (secret.startsWith('token=')) {
    nsUrl = `${nsUrl + secret}&`;
  } else {
    nsHeaders['API-SECRET'] = secret;
  }

  nsUrl += nsQuery;

  const optionsNS = {
    url: nsUrl,
    timeout: 30 * 1000,
    method: 'GET',
    headers: nsHeaders,
    json: true,
  };

  return requestPromise(optionsNS);
};

const queryLatestSGVs = (numResults) => {
  const secret = process.env.API_SECRET;
  let nsUrl = `${process.env.NIGHTSCOUT_HOST}/api/v1/entries.json?`;

  // time format needs to match the output of 'date -d "3 hours ago" -Iminutes -u'
  const nsQuery = `find[type]=sgv&count=${numResults}`;

  const nsHeaders = {
    'Content-Type': 'application/json',
  };

  if (secret.startsWith('token=')) {
    nsUrl = `${nsUrl + secret}&`;
  } else {
    nsHeaders['API-SECRET'] = secret;
  }

  nsUrl += nsQuery;

  const optionsNS = {
    url: nsUrl,
    timeout: 30 * 1000,
    method: 'GET',
    headers: nsHeaders,
    json: true,
  };

  return requestPromise(optionsNS);
};

const querySGVsBefore = (startTime, count) => {
  const secret = process.env.API_SECRET;
  let nsUrl = `${process.env.NIGHTSCOUT_HOST}/api/v1/entries.json?`;

  // time format needs to match the output of 'date -d "3 hours ago" -Iminutes -u'
  const nsQuery = `find[type]=sgv&find[dateString][$lte]=${startTime.toISOString()}&count=${count}`;

  const nsHeaders = {
    'Content-Type': 'application/json',
  };

  if (secret.startsWith('token=')) {
    nsUrl = `${nsUrl + secret}&`;
  } else {
    nsHeaders['API-SECRET'] = secret;
  }

  nsUrl += nsQuery;

  const optionsNS = {
    url: nsUrl,
    timeout: 30 * 1000,
    method: 'GET',
    headers: nsHeaders,
    json: true,
  };

  return requestPromise(optionsNS);
};

const querySGVsBetween = (startTime, endTime, count) => {
  const secret = process.env.API_SECRET;
  let nsUrl = `${process.env.NIGHTSCOUT_HOST}/api/v1/entries.json?`;

  // time format needs to match the output of 'date -d "3 hours ago" -Iminutes -u'
  const nsQuery = `find[type]=sgv&find[dateString][$gte]=${startTime.toISOString()}&find[dateString][$lte]=${endTime.toISOString()}&count=${count}`;

  const nsHeaders = {
    'Content-Type': 'application/json',
  };

  if (secret.startsWith('token=')) {
    nsUrl = `${nsUrl + secret}&`;
  } else {
    nsHeaders['API-SECRET'] = secret;
  }

  nsUrl += nsQuery;

  const optionsNS = {
    url: nsUrl,
    timeout: 30 * 1000,
    method: 'GET',
    headers: nsHeaders,
    json: true,
  };

  return requestPromise(optionsNS);
};

const querySGVsSince = (startTime, count) => {
  const secret = process.env.API_SECRET;
  let nsUrl = `${process.env.NIGHTSCOUT_HOST}/api/v1/entries.json?`;

  // time format needs to match the output of 'date -d "3 hours ago" -Iminutes -u'
  const nsQuery = `find[type]=sgv&find[dateString][$gte]=${startTime.toISOString()}&count=${count}`;

  const nsHeaders = {
    'Content-Type': 'application/json',
  };

  if (secret.startsWith('token=')) {
    nsUrl = `${nsUrl + secret}&`;
  } else {
    nsHeaders['API-SECRET'] = secret;
  }

  nsUrl += nsQuery;

  const optionsNS = {
    url: nsUrl,
    timeout: 30 * 1000,
    method: 'GET',
    headers: nsHeaders,
    json: true,
  };

  return requestPromise(optionsNS);
};

const queryLatestEvent = (type) => {
  const secret = process.env.API_SECRET;
  let nsUrl = `${process.env.NIGHTSCOUT_HOST}/api/v1/treatments.json?`;
  const oldestTime = moment().utc().subtract(2400, 'hours');

  const nsQuery = `find[created_at][$gte]=${oldestTime.format()}&find[eventType][$regex]=${type}&count=1`;

  const nsHeaders = {
    'Content-Type': 'application/json',
  };

  if (secret.startsWith('token=')) {
    nsUrl = `${nsUrl + secret}&`;
  } else {
    nsHeaders['API-SECRET'] = secret;
  }

  nsUrl += nsQuery;

  const optionsNS = {
    url: nsUrl,
    timeout: 30 * 1000,
    method: 'GET',
    headers: nsHeaders,
    json: true,
  };

  return requestPromise(optionsNS);
};

const queryBGChecksSince = (startTime) => {
  const secret = process.env.API_SECRET;
  let nsUrl = `${process.env.NIGHTSCOUT_HOST}/api/v1/treatments.json?`;

  // time format needs to match the output of 'date -d "3 hours ago" -Iminutes -u'
  const nsQuery = `find[eventType][$regex]=Check&find[created_at][$gte]=${startTime.format()}`;

  const nsHeaders = {
    'Content-Type': 'application/json',
  };

  if (secret.startsWith('token=')) {
    nsUrl = `${nsUrl + secret}&`;
  } else {
    nsHeaders['API-SECRET'] = secret;
  }

  nsUrl += nsQuery;

  const optionsNS = {
    url: nsUrl,
    timeout: 30 * 1000,
    method: 'GET',
    headers: nsHeaders,
    json: true,
  };

  return requestPromise(optionsNS);
};

const convertBGCheck = BGCheck => [{
  enteredBy: `xdripjs://${os.hostname()}`,
  eventType: 'BG Check',
  glucose: BGCheck.glucose,
  glucoseType: 'Finger',
  reason: 'Txmitter Calibration',
  duration: 0,
  units: 'mg/dl',
  created_at: moment(BGCheck.date).utc().format(),
}];

module.exports = () => ({
  // API (public) functions
  post: (glucose, sendToXdrip, sendToNS) => {
    const entry = [convertEntryToNS(glucose)];

    if (sendToXdrip) {
      postToXdrip(entry);
    }

    if (sendToNS) {
      postToNS(entry);
    }
  },

  updateBGCheck: (id, BGCheck) => {
    const entry = convertBGCheck(BGCheck);

    /* eslint-disable-next-line no-underscore-dangle */
    entry._id = id;

    const secret = process.env.API_SECRET;
    let nsUrl = `${process.env.NIGHTSCOUT_HOST}/api/v1/treatments/`;
    const nsHeaders = {
      'Content-Type': 'application/json',
    };

    if (secret.startsWith('token=')) {
      nsUrl = `${nsUrl}?${secret}`;
    } else {
      nsHeaders['API-SECRET'] = secret;
    }

    const optionsNS = {
      url: nsUrl,
      timeout: 30 * 1000,
      method: 'PUT',
      headers: nsHeaders,
      data: entry,
      json: true,
    };

    /* eslint-disable-next-line no-unused-vars */
    request(optionsNS, (err, response, body) => {
      if (err) {
        error('error posting BG Update to NS: ', err);
      } else {
        log(`updated BG Check to NS, statusCode = ${response.statusCode}`);
      }
    });
  },

  postAnnouncement: (message) => {
    const entry = [{
      created_at: moment().utc().format(),
      enteredBy: `xdripjs://${os.hostname()}`,
      eventType: 'Announcement',
      notes: message,
    }];

    const secret = process.env.API_SECRET;
    let nsUrl = `${process.env.NIGHTSCOUT_HOST}/api/v1/treatments.json`;
    const nsHeaders = {
      'Content-Type': 'application/json',
    };

    if (secret.startsWith('token=')) {
      nsUrl = `${nsUrl}?${secret}`;
    } else {
      nsHeaders['API-SECRET'] = secret;
    }

    const optionsNS = {
      url: nsUrl,
      method: 'POST',
      headers: nsHeaders,
      body: entry,
      json: true,
    };

    /* eslint-disable-next-line no-unused-vars */
    request(optionsNS, (err, response, body) => {
      if (err) {
        error('error posting Announcement to NS: ', err);
      } else {
        log(`uploaded new Announcement to NS, statusCode = ${response.statusCode}`);
        debug('Announcement:\n%O', entry);
      }
    });
  },

  postStatus: (txId, sgv, txStatus, cal, lastTxmitterCalTime) => {
    const entry = [{
      device: `xdripjs://${os.hostname()}`,
      xdripjs: {
        state: sgv.state,
        stateString: sgv.stateString,
        stateStringShort: sgv.stateStringShort,
        txId,
        txStatus: sgv.status,
        txStatusString: sgv.txStatusString,
        txStatusStringShort: sgv.txStatusStringShort,
        txActivation: sgv.transmitterStartDate,
        mode: sgv.mode,
        timestamp: sgv.readDateMills,
        rssi: sgv.rssi,
        unfiltered: sgv.unfiltered,
        filtered: sgv.filtered,
        noise: sgv.noise,
        noiseString: sgv.noiseString,
        slope: (cal && cal.slope) || 1,
        intercept: (cal && cal.intercept) || 0,
        calType: (cal && cal.type) || 'None', // 'LeastSquaresRegression' or 'SinglePoint' or 'Unity'
        lastCalibrationDate: lastTxmitterCalTime,
        sessionStart: sgv.sessionStartDate,
        batteryTimestamp: (txStatus && txStatus.timestamp.valueOf()) || null,
        voltagea: (txStatus && txStatus.voltagea) || null,
        voltageb: (txStatus && txStatus.voltageb) || null,
        temperature: (txStatus && txStatus.temperature) || null,
        resistance: (txStatus && txStatus.resist) || null,
      },
      created_at: moment().utc().format(),
    }];

    const secret = process.env.API_SECRET;
    let nsUrl = `${process.env.NIGHTSCOUT_HOST}/api/v1/devicestatus.json`;
    const nsHeaders = {
      'Content-Type': 'application/json',
    };

    if (secret.startsWith('token=')) {
      nsUrl = `${nsUrl}?${secret}`;
    } else {
      nsHeaders['API-SECRET'] = secret;
    }

    const optionsNS = {
      url: nsUrl,
      method: 'POST',
      headers: nsHeaders,
      body: entry,
      json: true,
    };

    /* eslint-disable-next-line no-unused-vars */
    request(optionsNS, (err, response, body) => {
      if (err) {
        error('error posting DeviceStatus to NS: ', err);
      } else {
        log(`uploaded new DeviceStatus to NS, statusCode = ${response.statusCode}`);
        debug('Status:\n%O', entry);
      }
    });
  },

  postBGCheck: (BGCheck) => {
    const entry = convertBGCheck(BGCheck);

    const secret = process.env.API_SECRET;
    let nsUrl = `${process.env.NIGHTSCOUT_HOST}/api/v1/treatments.json`;
    const nsHeaders = {
      'Content-Type': 'application/json',
    };

    if (secret.startsWith('token=')) {
      nsUrl = `${nsUrl}?${secret}`;
    } else {
      nsHeaders['API-SECRET'] = secret;
    }

    const optionsNS = {
      url: nsUrl,
      timeout: 30 * 1000,
      method: 'POST',
      headers: nsHeaders,
      body: entry,
      json: true,
    };

    /* eslint-disable-next-line no-unused-vars */
    request(optionsNS, (err, response, body) => {
      if (err) {
        error('error posting BG Check to NS: ', err);
      } else {
        log(`uploaded new BG Check to NS, statusCode = ${response.statusCode}`);
        debug('BG Check:\n%O', entry);
      }
    });
  },

  postCalibration: (calData) => {
    const entry = [{
      device: `xdripjs://${os.hostname()}`,
      type: 'cal',
      date: calData.date,
      dateString: new Date(calData.date).toISOString(),
      scale: calData.scale,
      intercept: calData.intercept,
      slope: calData.slope,
    }];

    const secret = process.env.API_SECRET;
    let nsUrl = `${process.env.NIGHTSCOUT_HOST}/api/v1/entries.json`;
    const nsHeaders = {
      'Content-Type': 'application/json',
    };

    if (secret.startsWith('token=')) {
      nsUrl = `${nsUrl}?${secret}`;
    } else {
      nsHeaders['API-SECRET'] = secret;
    }

    const optionsNS = {
      url: nsUrl,
      timeout: 30 * 1000,
      method: 'POST',
      headers: nsHeaders,
      body: entry,
      json: true,
    };

    /* eslint-disable-next-line no-unused-vars */
    request(optionsNS, (err, response, body) => {
      if (err) {
        error('error posting calibration to NS: ', err);
      } else {
        log(`uploaded new calibration to NS, statusCode = ${response.statusCode}`);
        debug('calibration:\n%O', entry);
      }
    });
  },

  postEvent: (eventType, eventTime) => {
    const entry = [{
      enteredBy: `xdripjs://${os.hostname()}`,
      eventType,
      created_at: eventTime.utc().format(),
    }];

    const secret = process.env.API_SECRET;
    let nsUrl = `${process.env.NIGHTSCOUT_HOST}/api/v1/treatments.json`;
    const nsHeaders = {
      'Content-Type': 'application/json',
    };

    if (secret.startsWith('token=')) {
      nsUrl = `${nsUrl}?${secret}`;
    } else {
      nsHeaders['API-SECRET'] = secret;
    }

    const optionsNS = {
      url: nsUrl,
      timeout: 30 * 1000,
      method: 'POST',
      headers: nsHeaders,
      body: entry,
      json: true,
    };

    /* eslint-disable-next-line no-unused-vars */
    request(optionsNS, (err, response, body) => {
      if (err) {
        error(`error posting ${eventType} to NS: `, err);
      } else {
        log(`uploaded new ${eventType} event to NS, statusCode = ${response.statusCode}`);
        debug('event:\n%O', entry);
      }
    });
  },

  latestCal: async () => {
    let formattedCal = null;

    const cal = await queryLatestCal();

    if (cal && (cal.length > 0)) {
      formattedCal = {
        date: cal[0].date,
        scale: cal[0].scale,
        slope: cal[0].slope,
        intercept: cal[0].intercept,
        type: 'NightScoutSynced',
      };

      if ((cal[0].slope === 1000) && (cal[0].intercept === 0)) {
        formattedCal.type = 'Unity';
      }
    }

    return formattedCal;
  },

  latestSGVs: async numResults => queryLatestSGVs(numResults),

  SGVsSince: async (startTime, numResults) => querySGVsSince(startTime, numResults),

  SGVsBefore: async (startTime, numResults) => querySGVsBefore(startTime, numResults),

  SGVsBetween: async (startTime, endTime, numResults) => querySGVsBetween(
    startTime, endTime, numResults,
  ),

  BGChecksSince: async startTime => queryBGChecksSince(startTime),

  latestEvent: async (type) => {
    let eventTime = null;

    const eventRecord = await queryLatestEvent(type);

    if (eventRecord && (eventRecord.length > 0)
      && eventRecord[0].created_at && (eventRecord[0].created_at.length > 10)) {
      eventTime = moment(eventRecord[0].created_at);
    }

    return eventTime;
  },

  convertEntryToNS: (glucose) => {
    const retVal = convertEntryToNS(glucose);

    return retVal;
  },

  convertEntryToxDrip: (glucose) => {
    const retVal = convertEntryToxDrip(glucose);

    return retVal;
  },
});
