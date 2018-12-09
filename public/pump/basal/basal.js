/* global angular */
angular.module('AngularOpenAPS.pump.basal', [
  'ngRoute',
])

  .config(($routeProvider) => {
    $routeProvider.when('/pump/basal', {
      templateUrl: 'pump/basal/basal.html',
      controller: 'BasalController',
    });
  })

  .controller('BasalController', ['$scope', 'Pump', ($scope, Pump) => {
    $scope.basal = Pump.basal;
  }])

  .filter('basalRate', () => value => `${value.toFixed(2)} U/hour`)

  .filter('basalMinute', () => (value) => {
    const hour = Math.floor(value / 60);
    const minute = value % 60;
    return `${(`${hour}`).padStart(2, '0')}:${(`${minute}`).padStart(2, '0')}`;
  });
