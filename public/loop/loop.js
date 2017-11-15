angular.module('AngularOpenAPS.loop', [
  'ngRoute'
])

.config(function($routeProvider) {
  $routeProvider.when('/loop', {
    templateUrl: 'loop/loop.html',
    controller: 'LoopController'
  });
})

.controller('LoopController', ['$scope', function ($scope) {
  $scope.iob = 3.5;
  $scope.cob = 85;
}])

.filter('units', function() {
  return function(value) {
    return value.toFixed(1) + ' U'
  };
})

.filter('grams', function() {
  return function(value) {
    return value.toFixed(0) + ' g'
  };
});
