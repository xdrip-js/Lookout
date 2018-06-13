angular.module('AngularOpenAPS.pump', [
  'ngRoute',
  'AngularOpenAPS.pump.basal'
])

  .config(function($routeProvider) {
    $routeProvider.when('/pump', {
      templateUrl: 'pump/pump.html'
    });
    $routeProvider.when('/pump/bolus', {
      templateUrl: 'pump/bolus/bolus.html'
    });
  })

  .service('Pump', ['socketFactory', function (socketFactory) {
    const socket = socketFactory({
      ioSocket: io.connect('/pump')
    });

    let basalProfile;// = [
    //   {minutes: 0, rate: 2.3},
    //   {minutes: 90, rate: 1.2},
    //   {minutes: 360, rate: 1.0},
    //   {minutes: 420, rate: 1.5},
    //   {minutes: 960, rate: 6.7}
    // ];

    this.basal = {
      get profile() {
        return basalProfile;
      }
    };

    socket.on('basalProfile', value => {
      basalProfile = value;
    });
  }]);
