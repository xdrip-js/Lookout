angular.module('AngularOpenAPS.loop', [
  'ngRoute'
])

.config(function($routeProvider) {
  $routeProvider.when('/loop', {
    templateUrl: 'loop/loop.html',
    controller: 'LoopController'
  });
})

.controller('LoopController', ['$scope', '$http', function ($scope, $http) {
  $http.get(__dirname + 'iob.json').then(data => {
    console.log(data);
    $scope.iob = data[0]["iob"];
  });
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
