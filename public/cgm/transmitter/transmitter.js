angular.module('AngularOpenAPS.cgm.transmitter', [
  'ngRoute'
])

  .config(function($routeProvider) {
    $routeProvider.when('/cgm/transmitter', {
      templateUrl: 'cgm/transmitter/transmitter.html',
      controller: 'TransmitterController'
    });
    $routeProvider.when('/cgm/transmitter/pair', {
      templateUrl: 'cgm/transmitter/pair.html',
      controller: 'TransmitterController'
    });
    $routeProvider.when('/cgm/transmitter/reset', {
      templateUrl: 'cgm/transmitter/reset.html',
      controller: 'TransmitterController'
    });
  })

  .controller('TransmitterController', ['$scope', '$interval', '$location', 'G5', function ($scope, $interval, $location, G5) {
    $scope.transmitter = G5.transmitter;

    const tick = function() {
      const activationDate = G5.transmitter.activationDate;
      $scope.age = activationDate ? (Date.now() - activationDate.valueOf()) / 1000 : null;
    };
    tick();
    $interval(tick, 1000);

    $scope.setID = function(id) {
      G5.transmitter.id = id;
      $location.path('/cgm/transmitter');
    };

    $scope.resetG5Tx = function() {
      G5.transmitter.reset();
      $location.path('/cgm/transmitter');
    };
  }]);
