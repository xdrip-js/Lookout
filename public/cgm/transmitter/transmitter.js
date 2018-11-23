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
    $routeProvider.when('/cgm/transmitter/meterid', {
      templateUrl: 'cgm/transmitter/meterid.html',
      controller: 'TransmitterController'
    });
    $routeProvider.when('/cgm/transmitter/reset', {
      templateUrl: 'cgm/transmitter/reset.html',
      controller: 'TransmitterController'
    });
  })

  .controller('TransmitterController', ['$scope', '$interval', '$location', 'CGM', function ($scope, $interval, $location, CGM) {
    $scope.transmitter = CGM.transmitter;

    const tick = function() {
      const activationDate = CGM.transmitter.activationDate;
      $scope.age = activationDate ? (Date.now() - activationDate.valueOf()) / 1000 : null;
    };
    tick();
    $interval(tick, 1000);

    $scope.setID = function(id) {
      CGM.transmitter.id = id;
      $location.path('/cgm/transmitter');
    };

    $scope.setMeterID = function(id) {
      CGM.transmitter.meterid = id;
      $location.path('/cgm/transmitter');
    };

    $scope.resetTxmitter = function() {
      CGM.transmitter.reset();
      $location.path('/cgm/transmitter');
    };
  }]);
