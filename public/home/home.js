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

.controller('HomeController', ['$scope', '$interval', 'G5', 'OpenAPS', function ($scope, $interval, G5, OpenAPS) {
  $scope.sensor = G5.sensor;
  $scope.loop = OpenAPS.loop;

  const tick = function() {
    const glucose = G5.sensor.glucose;
    $scope.glucoseAge = glucose ? (Date.now() - glucose.readDate) / 1000 : null;
    const enacted = OpenAPS.loop.enacted;
    $scope.enactedAge = enacted ? (Date.now() - enacted.date) / 1000 : null;
  };
  tick()
  $interval(tick, 1000);

  $scope.arrow = function() {
    const trend = G5.sensor.glucose.trend;
    if (trend <= -30) {
      return "<i class='fa fa-long-arrow-down text-primary'></i><i class='fa fa-long-arrow-down text-primary'></i>"
    } else if (trend <= -20) {
      return "<i class='fa fa-long-arrow-down text-primary'></i>"
    } else if (trend <= -10) {
      return "<i class='fa fa-long-arrow-right text-primary fa-rotate-45'></i>"
    } else if (trend < 10) {
      return "<i class='fa fa-long-arrow-right text-primary'></i>"
    } else if (trend < 20) {
      return "<i class='fa fa-long-arrow-right text-primary fa-rotate-minus-45'></i>"
    } else if (trend < 30) {
      return "<i class='fa fa-long-arrow-up text-primary'></i>"
    } else {
      return "<i class='fa fa-long-arrow-up text-primary'><i class='fa fa-long-arrow-up text-primary'></i>"
    }
  };
  // $scope.arrow = function() {
  //   const trend = G5.sensor.glucose.trend;
  //   if (trend <= -30) {
  //     return '&ddarr;'
  //   } else if (trend <= -20) {
  //     return '&darr;'
  //   } else if (trend <= -10) {
  //     return '&searr;'
  //   } else if (trend < 10) {
  //     return '&rarr;'
  //   } else if (trend < 20) {
  //     return '&nearr;'
  //   } else if (trend < 30) {
  //     return '&uarr;'
  //   } else {
  //     return '&uuarr;'
  //   }
  // };
}]);
