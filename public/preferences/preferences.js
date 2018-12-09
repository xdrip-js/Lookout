/* global angular */
angular.module('AngularOpenAPS.preferences', [
  'ngRoute',
])

  .config(($routeProvider) => {
    $routeProvider.when('/preferences', {
      templateUrl: 'preferences/preferences.html',
      controller: 'PreferencesController',
    });
  })

  /* eslint-disable-next-line no-unused-vars */
  .controller('PreferencesController', ['$scope', 'SharedState', ($scope, SharedState) => { }]);
