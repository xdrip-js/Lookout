angular.module('AngularOpenAPS.loop', [
  'ngRoute'
])

.config(function($routeProvider) {
  $routeProvider.when('/loop', {
    templateUrl: 'loop/loop.html',
    controller: 'LoopController'
  });
})

.service('OpenAPS', ['socketFactory', function (socketFactory) {
  const socket = socketFactory({
    ioSocket: io.connect('/loop')
  });

  this.loop = {
    get iob() {
      return 1.23;
    },
    get cob() {
      return 84;
    }
  };

  socket.on('iob', iob => {
    console.log('got iob of ' + iob);
  })
}])

.controller('LoopController', ['$scope', 'OpenAPS', function ($scope, OpenAPS) {
  // $http.get('iob.json').then(data => {
  // $http.get('./../../../myopenaps/monitor/iob.json').then(data => {
  //   console.log(data.data);
  //   console.log(data.data[0]);
  //   $scope.iob = data.data[0]["iob"];
  // });
  $scope.loop = OpenAPS.loop;
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
