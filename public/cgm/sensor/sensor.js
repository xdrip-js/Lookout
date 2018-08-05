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
    $routeProvider.when('/cgm/sensor/stop', {
      templateUrl: 'cgm/sensor/stop.html',
      controller: 'SensorController'
    });
  })

  .controller('SensorController', ['$scope', 'SharedState', '$interval', '$location', 'G5', function ($scope, SharedState, $interval, $location, G5) {
    $scope.sensor = G5.sensor;

    let units = SharedState.get('glucoseUnits');

    switch (units) {
    case 'mmol/L':
      $scope.calMin = 2.2;
      $scope.calMax = 22; 
      break;
    case 'mg/dL':
    default:
      $scope.calMin = 40;
      $scope.calMax = 400; 
    }

    const tick = function() {
      const sessionStartDate = G5.sensor.sessionStartDate;
      $scope.age = sessionStartDate ? (Date.now() - sessionStartDate.valueOf()) / 1000 : null;
    };
    tick();
    $interval(tick, 1000);

    $scope.calibrate = function(value) {
      // TODO: show validation error if we didn't receive a valid value.
      if (value) {
        G5.sensor.calibrate(value);
        $location.path('/cgm/sensor/pending');
      }
    };

    $scope.stopSensor = function() {
      G5.sensor.stop();
      $location.path('/cgm/sensor/pending');
    };
  }])

  .filter('state', function() {
    return function(state) {
      return state ? 'State: 0x' + state.toString(16) : '--';
    };
  });
