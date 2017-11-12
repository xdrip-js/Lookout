angular.module('AngularOpenAPS.pump', [
  'ngRoute'
])

.config(function($routeProvider) {
  $routeProvider.when('/pump', {
    templateUrl: 'pump/pump.html'
  });
})
