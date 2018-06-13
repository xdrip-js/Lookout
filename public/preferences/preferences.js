angular.module('AngularOpenAPS.preferences', [
  'ngRoute'
])

  .config(function($routeProvider) {
    $routeProvider.when('/preferences', {
      templateUrl: 'preferences/preferences.html',
      controller: 'PreferencesController'
    });
  })

  /*eslint-disable no-unused-vars*/
  .controller('PreferencesController', ['$scope', 'SharedState', function ($scope, SharedState) {
  /*eslint-enable no-unused-vars*/
  }]);
