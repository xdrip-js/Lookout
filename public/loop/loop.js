/* global angular io */
angular.module('AngularOpenAPS.loop', [
  'ngRoute',
])

  /* eslint-disable-next-line prefer-arrow-callback */
  .config(function loopConfig($routeProvider) {
    $routeProvider.when('/loop', {
      templateUrl: 'loop/loop.html',
      controller: 'LoopController',
    });
  })

  .service('OpenAPS', ['socketFactory', function loopService(socketFactory) {
    const socket = socketFactory({
      ioSocket: io.connect('/loop'),
    });

    let iob;
    let enacted;

    this.loop = {
      get iob() {
        return iob;
      },
      get cob() {
        return enacted ? enacted.COB : 0;
      },
      get enacted() {
        return enacted;
      },
    };

    socket.on('iob', (value) => {
      iob = value;
    });

    socket.on('enacted', (value) => {
      enacted = value;
    });
  }])

  .controller('LoopController', ['$scope', 'OpenAPS', function LoopController($scope, OpenAPS) {
  // $http.get('iob.json').then(data => {
  // $http.get('./../../../myopenaps/monitor/iob.json').then(data => {
  //   console.log(data.data);
  //   console.log(data.data[0]);
  //   $scope.iob = data.data[0]["iob"];
  // });
    $scope.loop = OpenAPS.loop;
  }])

  .filter('units', () => value => (value ? `${value.toFixed(1)} U` : '--'))

  .filter('grams', () => value => `${value && value.toFixed(0)} g`);
