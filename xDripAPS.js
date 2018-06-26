// const http = require("http");
const os = require('os');
const request = require('request');
const requestPromise = require('request-promise-native');
const moment = require('moment');

const convertEntry = (glucose) => {
  let direction;

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

  console.log('Glucose: ' + glucose.glucose + ' Trend: ' + Math.round(glucose.trend*10)/10 + ' direction: ' + direction);

  return [{
    'device': 'openaps://' + os.hostname(),
    'date': glucose.readDate,
    'dateString': new Date(glucose.readDate).toISOString(),
    'sgv': glucose.glucose,
    'direction': direction,
    'type': 'sgv',
    'filtered': glucose.filtered,
    'unfiltered': glucose.unfiltered,
    'rssi': '100', // TODO: consider reading this on connection and reporting
    'noise': glucose.nsNoise,
    'trend': glucose.trend,
    'glucose': glucose.glucose
  }];
};


const postToXdrip = (entry) => {
  const secret = process.env.API_SECRET;

  const optionsX = {
    url: 'http://127.0.0.1:5000/api/v1/entries',
    timeout: 30*1000,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'API-SECRET': secret
    },
    body: entry,
    json: true
  };

  /*eslint-disable no-unused-vars*/
  request(optionsX, function (error, response, body) {
  /*eslint-enable no-unused-vars*/
    if (error) {
      console.error('error posting json: ', error);
    } else {
      console.log('uploaded to xDripAPS, statusCode = ' + response.statusCode);
    }
  });
};

const postToNS = (entry) => {
  const secret = process.env.API_SECRET;
  let ns_url = process.env.NIGHTSCOUT_HOST + '/api/v1/entries.json';
  let ns_headers = {
    'Content-Type': 'application/json'
  };

  if (secret.startsWith('token=')) {
    ns_url = ns_url + '?' + secret;
  } else {
    ns_headers['API-SECRET'] = secret;
  }

  const optionsNS = {
    url: ns_url,
    timeout: 30*1000,
    method: 'POST',
    headers: ns_headers,
    body: entry,
    json: true
  };

  /*eslint-disable no-unused-vars*/
  request(optionsNS, function (error, response, body) {
  /*eslint-enable no-unused-vars*/
    if (error) {
      console.error('error posting json: ', error);
    } else {
      console.log('uploaded to NS, statusCode = ' + response.statusCode);
    }
  });
};

const queryLatestCal = () => {
  const secret = process.env.API_SECRET;
  let ns_url = process.env.NIGHTSCOUT_HOST + '/api/v1/entries.json?';

  // time format needs to match the output of 'date -d "3 hours ago" -Iminutes -u'
  let ns_query = 'find[type]=cal&count=1';

  let ns_headers = {
    'Content-Type': 'application/json'
  };

  if (secret.startsWith('token=')) {
    ns_url = ns_url + secret + '&';
  } else {
    ns_headers['API-SECRET'] = secret;
  }

  ns_url = ns_url + ns_query;

  let optionsNS = {
    url: ns_url,
    timeout: 30*1000,
    method: 'GET',
    headers: ns_headers,
    json: true
  };

  return requestPromise(optionsNS);
};

const queryLatestSGVs = (numResults) => {
  const secret = process.env.API_SECRET;
  let ns_url = process.env.NIGHTSCOUT_HOST + '/api/v1/entries.json?';

  // time format needs to match the output of 'date -d "3 hours ago" -Iminutes -u'
  let ns_query = 'find[type]=sgv&count=' + numResults;

  let ns_headers = {
    'Content-Type': 'application/json'
  };

  if (secret.startsWith('token=')) {
    ns_url = ns_url + secret + '&';
  } else {
    ns_headers['API-SECRET'] = secret;
  }

  ns_url = ns_url + ns_query;

  let optionsNS = {
    url: ns_url,
    timeout: 30*1000,
    method: 'GET',
    headers: ns_headers,
    json: true
  };

  return requestPromise(optionsNS);
};

const querySGVsBefore = (startTime, count) => {
  const secret = process.env.API_SECRET;
  let ns_url = process.env.NIGHTSCOUT_HOST + '/api/v1/entries.json?';

  // time format needs to match the output of 'date -d "3 hours ago" -Iminutes -u'
  let ns_query = 'find[type]=sgv&find[dateString][$lte]=' + startTime.toISOString() + '&count=' + count;

  let ns_headers = {
    'Content-Type': 'application/json'
  };

  if (secret.startsWith('token=')) {
    ns_url = ns_url + secret + '&';
  } else {
    ns_headers['API-SECRET'] = secret;
  }

  ns_url = ns_url + ns_query;

  let optionsNS = {
    url: ns_url,
    timeout: 30*1000,
    method: 'GET',
    headers: ns_headers,
    json: true
  };

  return requestPromise(optionsNS);
};

const querySGVsBetween = (startTime, endTime, count) => {
  const secret = process.env.API_SECRET;
  let ns_url = process.env.NIGHTSCOUT_HOST + '/api/v1/entries.json?';

  // time format needs to match the output of 'date -d "3 hours ago" -Iminutes -u'
  let ns_query = 'find[type]=sgv&find[dateString][$gte]=' + startTime.toISOString() + '&find[dateString][$lte]=' + endTime.toISOString() + '&count=' + count;

  let ns_headers = {
    'Content-Type': 'application/json'
  };

  if (secret.startsWith('token=')) {
    ns_url = ns_url + secret + '&';
  } else {
    ns_headers['API-SECRET'] = secret;
  }

  ns_url = ns_url + ns_query;

  let optionsNS = {
    url: ns_url,
    timeout: 30*1000,
    method: 'GET',
    headers: ns_headers,
    json: true
  };

  return requestPromise(optionsNS);
};

const querySGVsSince = (startTime, count) => {
  const secret = process.env.API_SECRET;
  let ns_url = process.env.NIGHTSCOUT_HOST + '/api/v1/entries.json?';

  // time format needs to match the output of 'date -d "3 hours ago" -Iminutes -u'
  let ns_query = 'find[type]=sgv&find[dateString][$gte]=' + startTime.toISOString() + '&count=' + count;

  let ns_headers = {
    'Content-Type': 'application/json'
  };

  if (secret.startsWith('token=')) {
    ns_url = ns_url + secret + '&';
  } else {
    ns_headers['API-SECRET'] = secret;
  }

  ns_url = ns_url + ns_query;

  let optionsNS = {
    url: ns_url,
    timeout: 30*1000,
    method: 'GET',
    headers: ns_headers,
    json: true
  };

  return requestPromise(optionsNS);
};

const queryLatestSensorInserted = () => {
  const secret = process.env.API_SECRET;
  let ns_url = process.env.NIGHTSCOUT_HOST + '/api/v1/treatments.json?';
  let oldestTime = moment().utc().subtract(2400, 'hours');

  let ns_query = 'find[created_at][$gte]=' + oldestTime.format() + '&find[eventType][$regex]=Sensor&count=1';

  let ns_headers = {
    'Content-Type': 'application/json'
  };

  if (secret.startsWith('token=')) {
    ns_url = ns_url + secret + '&';
  } else {
    ns_headers['API-SECRET'] = secret;
  }

  ns_url = ns_url + ns_query;

  let optionsNS = {
    url: ns_url,
    timeout: 30*1000,
    method: 'GET',
    headers: ns_headers,
    json: true
  };

  return requestPromise(optionsNS);
};

const queryBGChecksSince = (startTime) => {
  const secret = process.env.API_SECRET;
  let ns_url = process.env.NIGHTSCOUT_HOST + '/api/v1/treatments.json?';

  // time format needs to match the output of 'date -d "3 hours ago" -Iminutes -u'
  let ns_query = 'find[eventType][$regex]=Check&find[created_at][$gte]=' + startTime.format();

  let ns_headers = {
    'Content-Type': 'application/json'
  };

  if (secret.startsWith('token=')) {
    ns_url = ns_url + secret + '&';
  } else {
    ns_headers['API-SECRET'] = secret;
  }

  ns_url = ns_url + ns_query;

  let optionsNS = {
    url: ns_url,
    timeout: 30*1000,
    method: 'GET',
    headers: ns_headers,
    json: true
  };

  return requestPromise(optionsNS);
};

const convertBGCheck = (BGCheck) => {
  return [{
    'enteredBy': 'openaps://' + os.hostname(),
    'eventType': 'BG Check',
    'glucose': BGCheck.glucose,
    'glucoseType': 'Finger',
    'reason': 'G5 Calibration',
    'duration': 0,
    'units': 'mg/dl',
    'created_at': moment(BGCheck.date).format()
  }];
};

module.exports = () => {
  return {
    // API (public) functions
    post: (glucose, sendToXdrip) => {
      let entry = convertEntry(glucose);

      if (sendToXdrip) {
        postToXdrip(entry);
      }

      postToNS(entry);
    },

    updateBGCheck: (id, BGCheck) => {
      let entry = convertBGCheck(BGCheck);

      entry._id = id;

      const secret = process.env.API_SECRET;
      let ns_url = process.env.NIGHTSCOUT_HOST + '/api/v1/treatments/';
      let ns_headers = {
        'Content-Type': 'application/json'
      };

      if (secret.startsWith('token=')) {
        ns_url = ns_url + '?' + secret;
      } else {
        ns_headers['API-SECRET'] = secret;
      }

      const optionsNS = {
        url: ns_url,
        timeout: 30*1000,
        method: 'PUT',
        headers: ns_headers,
        data: entry,
        json: true
      };

      /*eslint-disable no-unused-vars*/
      request(optionsNS, function (error, response, body) {
      /*eslint-enable no-unused-vars*/
        if (error) {
          console.error('error posting json: ', error);
        } else {
          console.log('updated BG Check to NS, statusCode = ' + response.statusCode);
        }
      });
    },

    postAnnouncement: (message) => {
      const entry = [{
        'created_at': moment().format(),
        'enteredBy': 'openaps://' + os.hostname(),
        'eventType': 'Announcement',
        'notes': message
      }];

      const secret = process.env.API_SECRET;
      let ns_url = process.env.NIGHTSCOUT_HOST + '/api/v1/treatments.json';
      let ns_headers = {
        'Content-Type': 'application/json'
      };

      if (secret.startsWith('token=')) {
        ns_url = ns_url + '?' + secret;
      } else {
        ns_headers['API-SECRET'] = secret;
      }

      const optionsNS = {
        url: ns_url,
        method: 'POST',
        headers: ns_headers,
        body: entry,
        json: true
      };

      /*eslint-disable no-unused-vars*/
      request(optionsNS, function (error, response, body) {
      /*eslint-enable no-unused-vars*/
        if (error) {
          console.error('error posting json: ', error);
        } else {
          console.log('uploaded new Announcement to NS, statusCode = ' + response.statusCode);
        }
      });
    },

    postBGCheck: (BGCheck) => {
      let entry = convertBGCheck(BGCheck);

      const secret = process.env.API_SECRET;
      let ns_url = process.env.NIGHTSCOUT_HOST + '/api/v1/treatments.json';
      let ns_headers = {
        'Content-Type': 'application/json'
      };

      if (secret.startsWith('token=')) {
        ns_url = ns_url + '?' + secret;
      } else {
        ns_headers['API-SECRET'] = secret;
      }

      const optionsNS = {
        url: ns_url,
        timeout: 30*1000,
        method: 'POST',
        headers: ns_headers,
        body: entry,
        json: true
      };

      /*eslint-disable no-unused-vars*/
      request(optionsNS, function (error, response, body) {
      /*eslint-enable no-unused-vars*/
        if (error) {
          console.error('error posting json: ', error);
        } else {
          console.log('uploaded new BG Check to NS, statusCode = ' + response.statusCode);
        }
      });
    },

    postCalibration: (calData) => {

      const entry = [{
        'device': 'openaps://' + os.hostname(),
        'type': 'cal',
        'date': calData.date,
        'dateString': new Date(calData.date).toISOString(),
        'scale': calData.scale,
        'intercept': calData.intercept,
        'slope': calData.slope,
      }];

      const secret = process.env.API_SECRET;
      let ns_url = process.env.NIGHTSCOUT_HOST + '/api/v1/entries.json';
      let ns_headers = {
        'Content-Type': 'application/json'
      };

      if (secret.startsWith('token=')) {
        ns_url = ns_url + '?' + secret;
      } else {
        ns_headers['API-SECRET'] = secret;
      }

      const optionsNS = {
        url: ns_url,
        timeout: 30*1000,
        method: 'POST',
        headers: ns_headers,
        body: entry,
        json: true
      };

      /*eslint-disable no-unused-vars*/
      request(optionsNS, function (error, response, body) {
      /*eslint-enable no-unused-vars*/
        if (error) {
          console.error('error posting json: ', error);
        } else {
          console.log('uploaded new calibration to NS, statusCode = ' + response.statusCode);
        }
      });
    },

    latestCal: async () => {
      let formattedCal = null;

      let cal = await queryLatestCal();

      if (cal && (cal.length > 0)) {
        formattedCal = {
          date: cal[0].date,
          scale: cal[0].scale,
          slope: cal[0].slope,
          intercept: cal[0].intercept,
          type: 'NightScoutSynced'
        };

        if ((cal[0].slope==1) && (cal[0].intercept==0)) {
          formattedCal.type = 'Unity';
        }
      }

      return formattedCal;
    },

    latestSGVs: async (numResults) => {
      return queryLatestSGVs(numResults);
    },

    SGVsSince: async (startTime, numResults) => {
      return querySGVsSince(startTime, numResults);
    },

    SGVsBefore: async (startTime, numResults) => {
      return querySGVsBefore(startTime, numResults);
    },

    SGVsBetween: async (startTime, endTime, numResults) => {
      return querySGVsBetween(startTime, endTime, numResults);
    },

    BGChecksSince: async (startTime) => {
      return queryBGChecksSince(startTime);
    },

    latestSensorInserted: async () => {
      let insertTime = null;

      let sensorInsert = await queryLatestSensorInserted();

      if (sensorInsert && (sensorInsert.length > 0)) {
        insertTime = moment(sensorInsert[0].created_at);
      }

      return insertTime;
    }
  };
};
