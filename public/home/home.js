angular.module('AngularOpenAPS.home', [
  'ngRoute',
  'ngSanitize'
])

.config(function($routeProvider) {
  $routeProvider.when('/', {
    templateUrl: 'home/home.html',
    controller: 'HomeController'
  });
})

.controller('HomeController', ['$scope', '$interval', '$document', 'G5', 'OpenAPS', function ($scope, $interval, $document, G5, OpenAPS) {
  $scope.sensor = G5.sensor;
  $scope.loop = OpenAPS.loop;

  const tick = function() {
    const glucose = G5.sensor.glucose;
    $scope.glucoseAge = glucose ? (Date.now() - glucose.readDate) / 1000 : null;
    const enacted = OpenAPS.loop.enacted;
    $scope.enactedAge = enacted ? (Date.now() - enacted.date) / 1000 : null;
  };
  tick()
  $interval(tick, 1000);

  $scope.arrow = function() {
    // TODO: we could handle this with ng-if statements in the template
    // rather than using ng-bind as we do here
    const trend = G5.sensor.glucose.trend;
    if (trend <= -30) {
      return "<i class='fa fa-long-arrow-down text-primary'></i><i class='fa fa-long-arrow-down text-primary'></i>"
    } else if (trend <= -20) {
      return "<i class='fa fa-long-arrow-down text-primary'></i>"
    } else if (trend <= -10) {
      return "<i class='fa fa-long-arrow-right text-primary fa-rotate-45'></i>"
    } else if (trend < 10) {
      return "<i class='fa fa-long-arrow-right text-primary'></i>"
    } else if (trend < 20) {
      return "<i class='fa fa-long-arrow-right text-primary fa-rotate-minus-45'></i>"
    } else if (trend < 30) {
      return "<i class='fa fa-long-arrow-up text-primary'></i>"
    } else {
      return "<i class='fa fa-long-arrow-up text-primary'><i class='fa fa-long-arrow-up text-primary'></i>"
    }
  };


//   var chart = new Chart(ctx, {
//    type: 'line',
//    data: {
//       labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May'],
//       datasets: [{
//          label: '# of votes',
//          data: [3, 4, 1, 5, 6],
//          pointBackgroundColor: 'black',
//          pointRadius: 5,
//          fill: false,
//          showLine: false //<- set this
//       }]
//    }
// });

// See: http://www.chartjs.org/docs/latest/axes/cartesian/time.html
    // $scope.onClick = function (points, evt) {
    //   console.log(points, evt);
    // };
//     $scope.datasetOverride = [{
// //      yAxisID: 'y-axis-1',
//       pointRadius: 3,
//       fill: false,
//       showLine: false
//     }];

    // $scope.data = [[{
    //   x: Date.now() - 3*60*60*1000,
    //   y: 6.0
    // }, {
    //   x: Date.now() - 2*60*60*1000,
    //   y: 7.0
    // }, {
    //   x: Date.now() - 1*60*60*1000,
    //   y: 10.1
    // }, {
    //   x: Date.now() - 0*60*60*1000,
    //   y: 3.4
    // }]];


//  var data = [G5.sensor.history.map(entry => ({x: entry.readDate, y: entry.glucose / 18}))];

//  $scope.data = [[{x: Date.now(), y: 100/18}]];




}])

.directive('glucoseChart', ['$interval', function($interval) {
  return {
    restrict: 'E',
    replace: true,
    scope: {
      //data: '='
    },
    templateUrl: 'home/glucose-chart.html',
    link: function(scope, element, attrs) {
//      scope.data = [[{x: Date.now(), y: 100/18}]];
      let glucoseBaseTime = Date.now();
      scope.data = [
        Array.apply(null, Array(36)).map((x, i) => ({x: 3 * (i - 35)/36, y: 6 + 3 * Math.sin(0.2 * (i - 35))})),
        Array.apply(null, Array(36)).map((x, i) => ({x: 3 * i/36, y: 6 + 3 * Math.sin(0.2 * i)})),
      ];
      $interval(function() {
        const now = Date.now();
        timeInterval = (Date.now() - glucoseBaseTime) / 1000 / 60 / 60;
        console.log('shifting by ' + timeInterval);
        for (const dataset of scope.data) {
          for (const point of dataset) {
            point.x -= timeInterval;
          }
        }
        glucoseBaseTime = now;
      }, 1000);
      scope.datasetOverride = [
        {
    //      yAxisID: 'y-axis-1',
          pointRadius: 2,
          fill: false,
          showLine: false
        },
        {
    //      yAxisID: 'y-axis-1',
          pointRadius: 2,
          fill: false,
          showLine: false
        }
    ];
      scope.options = {
//        devicePixelRatio: 2,
        animation: {
          duration: 0
        },
        pointBorderColor: 'green',
        pointBackgroundColor: 'green',
        scales: {
          xAxes: [{
            type: 'linear',
            position: 'bottom',
            ticks: {
              min: -3,
              max: +3,
              stepSize: 1
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
              suggestedMin: 0,    // minimum will be 0, unless there is a lower value.
              suggestedMax: 20    // minimum will be 0, unless there is a lower value.
            }
          }]
        }
      };
      scope.colors = [
        {
          backgroundColor: 'green',
          borderColor: 'green'
        },
        {
          backgroundColor: 'white',
          borderColor: 'purple'
        }
      ];
      scope.onClick = function() {
        console.log('got click');
      };
      // $interval(function(){
      //   const max = Date.now();
      //   scope.options.scales.xAxes[0].time.max = max;
      //   scope.options.scales.xAxes[0].time.min = max - 3*60*60000;
      // }, 1000); // TODO: this could update every minute instead, wouldn't matter
    }
  }
}]);
