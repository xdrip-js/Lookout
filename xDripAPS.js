// const http = require("http");
const os = require('os');
const request = require('request');
const requestPromise = require('request-promise-native');
const moment = require('moment');
var _ = require('lodash');

const backfillNightscout = (glucoseHistory, latestTime) => {
  console.log('Backfilling Nightscout');

  _.each(glucoseHistory, (glucose) => {
    let glucoseTime = moment(glucose.readDate);
    let minutesAfterLast = glucoseTime.diff(latestTime, 'minutes');

    if ((minutesAfterLast > 0) && (glucose.glucose)) {
      let entry = convertEntry(glucose);

      console.log('Backfilling Nightscout: ' + glucoseTime.format());

      postToNS(entry);
    }
  });
};

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
    'rssi': "100", // TODO: consider reading this on connection and reporting
    'noise': glucose.nsNoise,
    'trend': glucose.trend,
    'glucose': glucose.glucose
  }];
};


const postToXdrip = (entry) => {
  const secret = process.env.API_SECRET;

  const optionsX = {
    url: 'http://127.0.0.1:5000/api/v1/entries',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
          'API-SECRET': secret
    },
    body: entry,
    json: true
  };

  request(optionsX, function (error, response, body) {
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

  if (secret.startsWith("token=")) {
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

  request(optionsNS, function (error, response, body) {
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
  let ns_query = 'find\[type\]=cal&count=1';

  let ns_headers = {
    'Content-Type': 'application/json'
  };

  if (secret.startsWith("token=")) {
    ns_url = ns_url + secret + '&';
  } else {
    ns_headers['API-SECRET'] = secret;
  }

  ns_url = ns_url + ns_query;

  let optionsNS = {
    url: ns_url,
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
  let ns_query = 'find\[type\]=sgv&count=' + numResults;

  let ns_headers = {
    'Content-Type': 'application/json'
  };

  if (secret.startsWith("token=")) {
    ns_url = ns_url + secret + '&';
  } else {
    ns_headers['API-SECRET'] = secret;
  }

  ns_url = ns_url + ns_query;

  let optionsNS = {
    url: ns_url,
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
  let ns_query = 'find\[type\]=sgv&find\[dateString\]\[\$gte\]=' + startTime.toISOString() + '&count=' + count;

  let ns_headers = {
    'Content-Type': 'application/json'
  };

  if (secret.startsWith("token=")) {
    ns_url = ns_url + secret + '&';
  } else {
    ns_headers['API-SECRET'] = secret;
  }

  ns_url = ns_url + ns_query;

  let optionsNS = {
    url: ns_url,
    method: 'GET',
    headers: ns_headers,
    json: true
  };

  return requestPromise(optionsNS);
};

const queryLatestSensorInserted = () => {
  const secret = process.env.API_SECRET;
  let ns_url = process.env.NIGHTSCOUT_HOST + '/api/v1/treatments.json?';

  let ns_query = 'find\[eventType\]\[\$regex\]=Sensor&count=1';

  let ns_headers = {
      'Content-Type': 'application/json'
  };

  if (secret.startsWith("token=")) {
    ns_url = ns_url + secret + '&';
  } else {
    ns_headers['API-SECRET'] = secret;
  }

  ns_url = ns_url + ns_query;

  let optionsNS = {
      url: ns_url,
      method: 'GET',
      headers: ns_headers,
      json: true
  };

  return requestPromise(optionsNS);
};

module.exports = () => {
  return {
    // API (public) functions
    post: (glucoseHist) => {
      // log error and ignore errant glucose values
      let glucose = glucoseHist[glucoseHist.length-1];

      if (glucose.glucose > 800 || glucose.glucose < 20) {
        console.log('Invalid glucose value received from transmitter, ignoring');
        return;
      }

      let entry = convertEntry(glucose);

      postToXdrip(entry);

      queryLatestSGVs(1).then((body) => {
        if (body.length > 0) {
          let latestTime = moment(body[0].dateString);
          let minutesSince = moment().diff(latestTime, 'minutes');

          console.log('Latest SGV time in NS: ' + latestTime.format() + ' minutes since: ' + minutesSince);

          if (minutesSince > 6) {
            backfillNightscout(glucoseHist, latestTime);
          } else {
            // backfillNightscout will upload the current
            // entry in addition to the missing entries.
            // Therefore, only post current entry to Nightscout
            // if we aren't backfilling.
            postToNS(entry);
          }
        }
      }).catch ((error) => {
        console.log('Error testing for nightscout backfill or upload: ' + error);
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

      if (secret.startsWith("token=")) {
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

      request(optionsNS, function (error, response, body) {
        if (error) {
          console.error('error posting json: ', error);
        } else {
          console.log('uploaded new calibration to NS, statusCode = ' + response.statusCode);
        }
      });
    },

    latestCal: async () => {
      return queryLatestCal();
    },

    latestSGVs: async (numResults) => {
      return queryLatestSGVs(numResults);
    },

    SGVsSince: async (startTime) => {
      return querySGVsSince(startTime);
    },

    latestSensorInserted: async () => {
      return queryLatestSensorInserted();
    }
  };
};
