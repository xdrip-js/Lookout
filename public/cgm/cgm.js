angular.module('AngularOpenAPS.cgm', [
  'ngRoute',
  'AngularOpenAPS.cgm.transmitter',
  'AngularOpenAPS.cgm.sensor'
])

.config(function($routeProvider) {
  $routeProvider.when('/cgm', {
    templateUrl: 'cgm/cgm.html'
  });
})

.service('G5', ['socketFactory', function (socketFactory) {
  const socket = socketFactory({
    ioSocket: io.connect('/cgm')
  });

  let id;
  let glucose;
  // TODO: replace these with the real thing (faked for now)
  let version = "1.2.3.4";
  let lastCalibration;
  let history = [];

  let pendingActions;// = [
  //   {date: Date.now(), glucose: 100},
  //   {date: Date.now() - 1*60*1000, glucose: 100},
  //   {date: Date.now() - 2*60*1000, glucose: 100},
  //   {date: Date.now() - 3*60*1000, glucose: 100},
  //   {date: Date.now() - 4*60*1000, glucose: 100},
  //   {date: Date.now() - 5*60*1000, glucose: 100}
  // ];

  this.transmitter = {
    // properties
    get id() {
      return id;
    },
    set id(value) {
      socket.emit('id', value)
    },
    get version() {
      return version;
    },
    get activationDate() {
      return glucose ? glucose.transmitterStartDate : null;
    },
    get status() {
      return glucose ? glucose.status : null;
    }
  };

  this.sensor = {
    // properties
    get sessionStartDate() {
      return glucose ? glucose.sessionStartDate : null;
    },
    get glucose() {
      // only return the properties glucose, filtered, readDate and trend
      // - we don't need the rest
      return glucose ?
        (({ glucose, filtered, unfiltered, readDate, trend }) => ({ glucose, filtered, unfiltered, readDate, trend }))(glucose) :
        null;
    },
    get state() {
      return glucose ? glucose.state : null;
    },
    get stateString() {
      return glucose ? glucose.stateString : null;
    },
    get lastCalibration() {
      return lastCalibration;
    },
    get inSession() {
      return glucose ? glucose.inSession : null;
    },
    get pendingActions() {
      return pendingActions;
    },
    get history() {
      return history;
    },

    // methods
    calibrate: function(value) {
      console.log('emitting a cal value of ' + value);
      socket.emit('calibrate', value);
    },
    start: function() {
      console.log('starting sensor');
      socket.emit('startSensor');
    },
    backstart: function() {
      console.log('starting sensor 2 hours prior to now');
      socket.emit('backStartSensor');
    },
    stop: function() {
      console.log('stopping sensor');
      socket.emit('stopSensor');
    }
  };

  socket.on('version', version => {
    console.log('got version');
    this.transmitter.version = version;
  });

  socket.on('id', value => {
    console.log('got id of ' + value);
    id = value;
  });

  socket.on('glucose', value => {
    glucose = value;
  });

  socket.on('calibration', calibration => {
    console.log('got calibration');
    this.sensor.calibration = calibration;
  });

  socket.on('pending', pending => {
    console.log('got pending');
    pendingActions = pending;
  });

  socket.on('calibrationData', data => {
    console.log('got calibration data');
    lastCalibration = data;
  });

  socket.on('glucoseHistory', data => {
    console.log('got glucose history');
    history = data;
  })
}]);
