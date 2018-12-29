/* global angular */
angular.module('AngularOpenAPS.preferences', [
  'ngRoute',
])

  /* eslint-disable-next-line prefer-arrow-callback */
  .config(function preferencesConfig($routeProvider) {
    $routeProvider.when('/preferences', {
      templateUrl: 'preferences/preferences.html',
      controller: 'PreferencesController',
    });
  })

  /* eslint-disable-next-line no-unused-vars */
  .controller('PreferencesController', ['$scope', 'SharedState', function PreferencesController($scope, SharedState) { }]);
