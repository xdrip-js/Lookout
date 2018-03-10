angular.module('AngularOpenAPS.cgm.sensor', [
  'ngRoute'
])

.config(function($routeProvider) {
  $routeProvider.when('/cgm/sensor', {
    templateUrl: 'cgm/sensor/sensor.html',
    controller: 'SensorController'
  });
  $routeProvider.when('/cgm/sensor/calibrate', {
    templateUrl: 'cgm/sensor/calibrate.html',
    controller: 'SensorController'
  });
  $routeProvider.when('/cgm/sensor/calibration', {
    templateUrl: 'cgm/sensor/calibration.html',
    controller: 'SensorController'
  });
  $routeProvider.when('/cgm/sensor/pending', {
    templateUrl: 'cgm/sensor/pending.html',
    controller: 'SensorController'
  });
})

.controller('SensorController', ['$scope', '$interval', '$location', 'G5', function ($scope, $interval, $location, G5) {
  $scope.sensor = G5.sensor;

  const tick = function() {
    const sessionStartDate = G5.sensor.sessionStartDate;
    $scope.age = sessionStartDate ? (Date.now() - sessionStartDate) / 1000 : null;
  };
  tick()
  $interval(tick, 1000);

  $scope.calibrate = function(value) {
    G5.sensor.calibrate(value);
    $location.path('/cgm/sensor/pending');
  };
}])

.filter('state', function() {
  const stateString = (state) => {
  }
  return function(state) {
    switch (state) {
      case 0x00:
        return 'None';
      case 0x01:
        return 'Stopped';
      case 0x02:
        return 'Warmup';
      case 0x03:
        return 'Unused';
      case 0x04:
        return 'First calibration';
      case 0x05:
        return 'Second calibration';
      case 0x06:
        return 'OK';
      case 0x07:
        return 'Need calibration';
      case 0x08:
        return 'Calibration Error 1';
      case 0x09:
        return 'Calibration Error 0';
      case 0x0a:
        return 'Calibration Linearity Fit Failure';
      case 0x0b:
        return 'Sensor Failed Due to Counts Aberration';
      case 0x0c:
        return 'Sensor Failed Due to Residual Aberration';
      case 0x0d:
        return 'Out of Calibration Due To Outlier';
      case 0x0e:
        return 'Outlier Calibration Request - Need a Calibration';
      case 0x0f:
        return 'Session Expired';
      case 0x10:
        return 'Session Failed Due To Unrecoverable Error';
      case 0x11:
        return 'Session Failed Due To Transmitter Error';
      case 0x12:
        return 'Temporary Session Failure - ???';
      case 0x13:
        return 'Reserved';
      case 0x80:
        return 'Calibration State - Start';
      case 0x81:
        return 'Calibration State - Start Up';
      case 0x82:
        return 'Calibration State - First of Two Calibrations Needed';
      case 0x83:
        return 'Calibration State - High Wedge Display With First BG';
      case 0x84:
        return 'Unused Calibration State - Low Wedge Display With First BG';
      case 0x85:
        return 'Calibration State - Second of Two Calibrations Needed';
      case 0x86:
        return 'Calibration State - In Calibration Transmitter';
      case 0x87:
        return 'Calibration State - In Calibration Display';
      case 0x88:
        return 'Calibration State - High Wedge Transmitter';
      case 0x89:
        return 'Calibration State - Low Wedge Transmitter';
      case 0x8a:
        return 'Calibration State - Linearity Fit Transmitter';
      case 0x8b:
        return 'Calibration State - Out of Cal Due to Outlier Transmitter';
      case 0x8c:
        return 'Calibration State - High Wedge Display';
      case 0x8d:
        return 'Calibration State - Low Wedge Display';
      case 0x8e:
        return 'Calibration State - Linearity Fit Display';
      case 0x8f:
        return 'Calibration State - Session Not in Progress';
      default:
        return state ? 'Unknown: 0x' + state.toString(16) : '--';
    }
  };
});
