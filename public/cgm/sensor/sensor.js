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
})

.controller('SensorController', ['$scope', 'G5', function ($scope, G5) {
  // TODO: all I have done here is wrap G5.sensor
  // maybe just keep an explicit ref to it
  $scope.sensor = G5.sensor;

  $scope.age = function() {
    return G5.sensor.age();
  }

  $scope.state = function() {
    return G5.sensor.state();
  }

  $scope.start = function() {
    G5.start();
  };

  $scope.stop = function() {
    G5.stop();
  };

  $scope.calibrate = function(value) {
    G5.sensor.calibrate(value);
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
     case 0x0c:
       return "???";
     default:
       return state ? "Unknown: 0x" + state.toString(16) : '--';
     }
  };
});
