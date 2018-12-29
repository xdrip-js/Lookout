/* global angular */
angular.module('AngularOpenAPS.home', [
  'ngRoute',
  'ngSanitize',
])

  .config(($routeProvider) => {
    $routeProvider.when('/', {
      templateUrl: 'home/home.html',
      controller: 'HomeController',
    });
  })

  .controller('HomeController', ['$scope', '$interval', '$document', '$location', 'CGM', 'OpenAPS', function HomeController($scope, $interval, $document, $location, CGM, OpenAPS) {
    $scope.sensor = CGM.sensor;
    $scope.loop = OpenAPS.loop;

    const tick = () => {
      const { glucose } = CGM.sensor;
      $scope.glucoseAge = glucose ? (Date.now() - glucose.readDateMills) / 1000 : null;
      const { enacted } = OpenAPS.loop;
      $scope.enactedAge = enacted ? (Date.now() - enacted.date) / 1000 : null;
    };
    tick();
    $interval(tick, 1000);

    $scope.arrow = () => {
    // TODO: we could handle this with ng-if statements in the template
    // rather than using ng-bind as we do here
      const { trend } = CGM.sensor.glucose;
      if (trend <= -30) {
        return '<i class=\'fa fa-long-arrow-down text-primary\'></i><i class=\'fa fa-long-arrow-down text-primary\'></i>';
      } if (trend <= -20) {
        return '<i class=\'fa fa-long-arrow-down text-primary\'></i>';
      } if (trend <= -10) {
        return '<i class=\'fa fa-long-arrow-right text-primary fa-rotate-45\'></i>';
      } if (trend < 10) {
        return '<i class=\'fa fa-long-arrow-right text-primary\'></i>';
      } if (trend < 20) {
        return '<i class=\'fa fa-long-arrow-right text-primary fa-rotate-minus-45\'></i>';
      } if (trend < 30) {
        return '<i class=\'fa fa-long-arrow-up text-primary\'></i>';
      }
      return '<i class=\'fa fa-long-arrow-up text-primary\'><i class=\'fa fa-long-arrow-up text-primary\'></i>';
    };

    $scope.start = () => {
      CGM.sensor.start();
      $location.path('/cgm/sensor/pending');
    };

    $scope.backstart = () => {
      CGM.sensor.backstart();
      $location.path('/cgm/sensor/pending');
    };
  }])

  .directive('glucoseChart', ['$interval', 'SharedState', 'CGM', ($interval, SharedState, CGM) => ({
    restrict: 'E',
    replace: true,
    scope: {
      // data: '='
    },
    templateUrl: 'home/glucose-chart.html',
    /* eslint-disable-next-line no-unused-vars */
    link(scope, element, attrs) {
      /* eslint-disable no-param-reassign */
      //      scope.data = [[{x: Date.now(), y: 100/18}]];
      const units = SharedState.get('glucoseUnits');
      let factor;

      switch (units) {
        case 'mmol/L':
          factor = 18;
          break;
        case 'mg/dL':
        default:
          factor = 1;
      }

      scope.data = [[]];
      $interval(() => {
        const now = Date.now();
        const latestSGV = scope.data[0][scope.data[0].length - 1];
        const latestSGVReadDate = latestSGV ? latestSGV.readDate : null;
        const hist = CGM.sensor.history;

        if (hist) {
          for (let i = 0; i < hist.length; i += 1) {
            const { readDate } = hist[i];
            const y = Math.round(hist[i].glucose / factor * 10) / 10.0;

            if (!latestSGVReadDate || ((readDate - latestSGVReadDate) > 2 * 60 * 1000)) {
              scope.data[0].push({ readDate, y });
            }
          }
        }

        for (let i = 0; i < scope.data.length; i += 1) {
          for (let j = 0; j < scope.data[i].length; j += 1) {
            scope.data[i][j].x = (scope.data[i][j].readDate - now) / 1000 / 60 / 60.0;
          }
        }
      }, 1000);
      scope.datasetOverride = [
        {
          //      yAxisID: 'y-axis-1',
          pointRadius: 2,
          fill: false,
          showLine: false,
        },
        {
          //      yAxisID: 'y-axis-1',
          pointRadius: 2,
          fill: false,
          showLine: false,
        },
      ];
      scope.options = {
        //        devicePixelRatio: 2,
        animation: {
          duration: 0,
        },
        pointBorderColor: 'green',
        pointBackgroundColor: 'green',
        scales: {
          xAxes: [{
            type: 'linear',
            position: 'bottom',
            ticks: {
              min: -3,
              max: 0,
              stepSize: 1,
            },
            // ticks: {
            //   source: 'data'
            // },
            // time: {
            //   min: Date.now() - 3*60*60000,
            //   max: Date.now()
            // }
          }],
          yAxes: [{
            display: true,
            ticks: {
              suggestedMin: 0, // minimum will be 0, unless there is a lower value.
              suggestedMax: 20, // minimum will be 0, unless there is a lower value.
            },
          }],
        },
      };
      scope.colors = [
        {
          backgroundColor: 'green',
          borderColor: 'green',
        },
        {
          backgroundColor: 'white',
          borderColor: 'purple',
        },
      ];
      // scope.onClick = function () {
      //   console.log('got click');
      // };
      // $interval(function(){
      //   const max = Date.now();
      //   scope.options.scales.xAxes[0].time.max = max;
      //   scope.options.scales.xAxes[0].time.min = max - 3*60*60000;
      // }, 1000); // TODO: this could update every minute instead, wouldn't matter

      /* eslint-enable no-param-reassign */
    },
  })]);
