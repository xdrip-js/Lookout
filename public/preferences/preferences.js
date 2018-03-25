angular.module('AngularOpenAPS.preferences', [
  'ngRoute'
])

.config(function($routeProvider) {
  $routeProvider.when('/preferences', {
    templateUrl: 'preferences/preferences.html',
    controller: 'PreferencesController'
  });
})

.controller('PreferencesController', ['$scope', "SharedState", function ($scope, SharedState) {
}]);
