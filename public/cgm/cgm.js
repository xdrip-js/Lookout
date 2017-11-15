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

// TODO: consider if this is best placed within the cgm module
.service('G5', ['socketFactory', function (socketFactory) {
  const socket = socketFactory({
    ioSocket: io.connect('/cgm')
  });

  let id;
  let glucose;
  // TODO: replace these with the real thing (faked for now)
  let version = "1.2.3.4";
  let lastCalibration = {
    date: Date.now() - 12*60*60*1000,
    glucose: 100
  };


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
      // only return the properties glucose, readDate and trend
      // - we don't need the rest
      return glucose ?
        (({ glucose, filtered, readDate, trend }) => ({ glucose, filtered, readDate, trend }))(glucose) :
        null;
    },
    get state() {
      return glucose ? glucose.state : null;
    },
    get lastCalibration() {
      return lastCalibration;
    },
    get inSession() {
      return glucose ? glucose.inSession : null;
    },

    // methods
    calibrate: function(value) {
      console.log('emitting a cal value of ' + value);
      socket.emit('calibrate', value);
    },
    start: function() {
      socket.emit('startSensor');
    },
    stop: function() {
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
}]);
