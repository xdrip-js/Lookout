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
  // $http.get('iob.json').then(data => {
  $http.get('/root/myopenaps/monitor/iob.json').then(data => {
    console.log(data.data);
    console.log(data.data[0]);
    $scope.iob = data.data[0]["iob"];
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
