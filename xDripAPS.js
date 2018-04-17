// const http = require("http");
const os = require("os");
const request = require("request")
const requestPromise = require('request-promise-native');
const moment = require('moment');

const queryLatestSGVTime = () => {
    const secret = process.env.API_SECRET;
    let ns_url = process.env.NIGHTSCOUT_HOST + '/api/v1/entries.json?';

    // time format needs to match the output of 'date -d "3 hours ago" -Iminutes -u'
    let ns_query = 'find\[type\]=sgv&count=1';

    let ns_headers = {
        'Content-Type': 'application/json'
    };

    if (secret.startsWith("token=")) {
      ns_url = ns_url + secret + '&';
    } else {
      ns_headers = {
        'Content-Type': 'application/json',
        'API-SECRET': secret
      };

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
      console.error('error posting json: ', error)
    } else {
      console.log('uploaded to xDripAPS, statusCode = ' + response.statusCode);
    }
  })
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
    ns_headers = {
      'Content-Type': 'application/json',
      'API-SECRET': secret
    };
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
      console.error('error posting json: ', error)
    } else {
      console.log('uploaded to NS, statusCode = ' + response.statusCode);
    }
  })
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

      console.log('Trend: ' + Math.round(glucose.trend*10)/10 + ' direction: ' + direction);

      const entry = [{
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

      const data = JSON.stringify(entry);

      postToXdrip(entry);

      queryLatestSGVTime().then((body) => {
        if (body.length > 0) {
          latestTime = moment(body[0]['dateString']);
          console.log('Latest SGV time in NS: ' + latestTime.format());
        }

         postToNS(entry);
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

      const data = JSON.stringify(entry);

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
          console.error('error posting json: ', error)
        } else {
          console.log('uploaded new calibration to NS, statusCode = ' + response.statusCode);
        }
      })
    }
  };
};
