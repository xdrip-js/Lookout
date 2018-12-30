/* global angular io moment */
angular.module('AngularOpenAPS.cgm', [
  'ngRoute',
  'AngularOpenAPS.cgm.transmitter',
  'AngularOpenAPS.cgm.sensor',
])

  /* eslint-disable-next-line prefer-arrow-callback */
  .config(function CGMConfig($routeProvider) {
    $routeProvider.when('/cgm', {
      templateUrl: 'cgm/cgm.html',
    });
  })

  .service('CGM', ['socketFactory', function CGMService(socketFactory) {
    const socket = socketFactory({
      ioSocket: io.connect('/cgm'),
    });

    let id;
    let meterid;
    let glucose;
    // TODO: replace these with the real thing (faked for now)
    const version = '1.2.3.4';
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
        socket.emit('id', value);
      },
      get meterid() {
        return meterid;
      },
      set meterid(value) {
        socket.emit('meterid', value);
      },
      get version() {
        return version;
      },
      get activationDate() {
        return glucose ? moment(glucose.transmitterStartDate) : null;
      },
      get status() {
        return glucose ? glucose.txStatusString : null;
      },
      get voltagea() {
        return glucose ? glucose.voltagea : null;
      },
      get voltageb() {
        return glucose ? glucose.voltageb : null;
      },
      reset() {
        socket.emit('resetTx');
      },
    };

    this.sensor = {
    // properties
      get sessionStartDate() {
        return glucose ? moment(glucose.sessionStartDate) : null;
      },
      get glucose() {
      // only return the properties glucose, filtered, readDate and trend
      // - we don't need the rest
        return glucose
          ? (({
            /* eslint-disable-next-line no-shadow */
            glucose, filtered, unfiltered, readDate, readDateMills, trend,
          }) => ({
            glucose, filtered, unfiltered, readDate, readDateMills, trend,
          }))(glucose)
          : null;
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
      get displayGlucose() {
        return glucose
          ? (glucose.inSession || glucose.inExpiredSession || glucose.inExtendedSession)
          : null;
      },
      get pendingActions() {
        return pendingActions;
      },
      get history() {
        return history;
      },

      // methods
      calibrate(value) {
        socket.emit('calibrate', value);
      },
      start() {
        socket.emit('startSensor');
      },
      backstart() {
        socket.emit('backStartSensor');
      },
      stop() {
        socket.emit('stopSensor');
      },
    };

    socket.on('version', (newVersion) => {
      this.transmitter.version = newVersion;
    });

    socket.on('id', (value) => {
      id = value;
    });

    socket.on('meterid', (value) => {
      meterid = value;
    });

    socket.on('glucose', (value) => {
      glucose = value;

      if (history.length > 0) {
        const latestSGV = history[history.length - 1];

        if (glucose.readDateMills > latestSGV.readDate) {
          history.push({
            readDate: glucose.readDateMills,
            glucose: glucose.glucose,
          });

          // only hold enough for the last 24 hours.
          history = history.slice(-12 * 24);
        }
      }
    });

    socket.on('calibration', (calibration) => {
      this.sensor.calibration = calibration;
    });

    socket.on('pending', (pending) => {
      pendingActions = pending;
    });

    socket.on('calibrationData', (data) => {
      lastCalibration = data;
    });

    socket.on('glucoseHistory', (data) => {
      history = data;
    });
  }]);
