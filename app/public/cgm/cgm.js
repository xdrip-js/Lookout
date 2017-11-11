angular.module('AngularOpenAPS.cgm', [
  'ngRoute',
  'AngularOpenAPS.cgm.transmitter',
  'AngularOpenAPS.cgm.sensor'
])

.config(function($routeProvider) {
  $routeProvider.when('/cgm', {
    templateUrl: 'cgm/cgm.html'
  });
})
