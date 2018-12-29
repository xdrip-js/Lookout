/* global angular */
angular.module('AngularOpenAPS.cgm.transmitter', [
  'ngRoute',
])

  .config(($routeProvider) => {
    $routeProvider.when('/cgm/transmitter', {
      templateUrl: 'cgm/transmitter/transmitter.html',
      controller: 'TransmitterController',
    });
    $routeProvider.when('/cgm/transmitter/pair', {
      templateUrl: 'cgm/transmitter/pair.html',
      controller: 'TransmitterController',
    });
    $routeProvider.when('/cgm/transmitter/meterid', {
      templateUrl: 'cgm/transmitter/meterid.html',
      controller: 'TransmitterController',
    });
    $routeProvider.when('/cgm/transmitter/reset', {
      templateUrl: 'cgm/transmitter/reset.html',
      controller: 'TransmitterController',
    });
  })

  .controller('TransmitterController', ['$scope', '$interval', '$location', 'CGM', function TransmitterController($scope, $interval, $location, CGM) {
    /* eslint-disable no-param-reassign */
    $scope.transmitter = CGM.transmitter;

    const tick = () => {
      const { activationDate } = CGM.transmitter;
      $scope.age = activationDate ? (Date.now() - activationDate.valueOf()) / 1000 : null;
    };
    tick();
    $interval(tick, 1000);

    $scope.setID = (id) => {
      CGM.transmitter.id = id;
      $location.path('/cgm/transmitter');
    };

    $scope.setMeterID = (id) => {
      CGM.transmitter.meterid = id;
      $location.path('/cgm/transmitter');
    };

    $scope.resetTxmitter = () => {
      CGM.transmitter.reset();
      $location.path('/cgm/transmitter');
    };
    /* eslint-enable no-param-reassign */
  }]);
