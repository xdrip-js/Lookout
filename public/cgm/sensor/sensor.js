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
    console.log('in new valibrate');
    G5.sensor.calibrate(value);
    $location.path('/cgm/sensor/pending');
  };
}])

.filter('state', function() {
  return function(state) {
   switch (state) {
     case 0x01:
       return "Stopped";
     case 0x02:
       return "Warmup";
     case 0x04:
       return "First calibration";
     case 0x05:
       return "Second calibration";
     case 0x06:
       return "OK";
     case 0x07:
       return "Need calibration";
     case 0x0a:
       return "Enter new BG meter value";
     case 0x0b:
       return "Failed sensor";
     case 0x12:
       return "???";
     default:
       return state ? "Unknown: 0x" + state.toString(16) : '--';
     }
  };
});
