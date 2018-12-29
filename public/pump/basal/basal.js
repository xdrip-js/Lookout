/* global angular */
angular.module('AngularOpenAPS.pump.basal', [
  'ngRoute',
])

  /* eslint-disable-next-line prefer-arrow-callback */
  .config(function basalConfig($routeProvider) {
    $routeProvider.when('/pump/basal', {
      templateUrl: 'pump/basal/basal.html',
      controller: 'BasalController',
    });
  })

  .controller('BasalController', ['$scope', 'Pump', function BasalController($scope, Pump) {
    $scope.basal = Pump.basal;
  }])

  /* eslint-disable-next-line prefer-arrow-callback */
  .filter('basalRate', function basalRateFilter() {
    return function filterBasalRate(value) { return `${value.toFixed(2)} U/hour`; };
  })

  /* eslint-disable-next-line prefer-arrow-callback */
  .filter('basalMinute', function basalMinuteFilter() {
    return function filterBasalMinute(value) {
      const hour = Math.floor(value / 60);
      const minute = value % 60;
      return `${(`${hour}`).padStart(2, '0')}:${(`${minute}`).padStart(2, '0')}`;
    };
  });
