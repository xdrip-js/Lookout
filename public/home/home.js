angular.module('AngularOpenAPS.home', [
  'ngRoute',
  'ngSanitize'
])

.config(function($routeProvider) {
  $routeProvider.when('/', {
    templateUrl: 'home/home.html',
    controller: 'HomeController'
  });
})

.controller('HomeController', ['$scope', '$interval', 'G5', function ($scope, $interval, G5) {
  $scope.sensor = G5.sensor;

  const tick = function() {
    const glucose = G5.sensor.glucose;
    $scope.glucoseAge = glucose ? (Date.now() - glucose.readDate) / 1000 : null;
  };
  tick()
  $interval(tick, 1000);

  $scope.arrow = function() {
    const trend = G5.sensor.glucose.trend;
    if (trend <= -30) {
      return '&ddarr;'
    } else if (trend <= -20) {
      return '&darr;'
    } else if (trend <= -10) {
      return '&searr;'
    } else if (trend < 10) {
      return '&rarr;'
    } else if (trend < 20) {
      return '&nearr;'
    } else if (trend < 30) {
      return '&uarr;'
    } else {
      return '&uuarr;'
    }
  };
}]);
