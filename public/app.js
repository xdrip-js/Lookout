/* global angular */
angular.module('AngularOpenAPS', [
  'AngularOpenAPS.home',
  'AngularOpenAPS.preferences',
  'AngularOpenAPS.cgm',
  'AngularOpenAPS.loop',
  'AngularOpenAPS.pump',
  'ngRoute',
  'ngStorage',
  'ngSanitize',
  // 'ngTouch',
  'mobile-angular-ui',
  'mobile-angular-ui.core.sharedState',
  'btford.socket-io',
  'chart.js',
  'angularMoment',
])

  /* eslint-disable-next-line prefer-arrow-callback */
  .config(function AngularOpenAPSConfig($locationProvider) {
    $locationProvider.html5Mode(true);
  })

  .controller('MyCtrl', ['$rootScope', '$scope', '$localStorage', 'SharedState', function MyCtrl(
    $rootScope,
    $scope,
    $localStorage,
    SharedState,
  ) {
    /* eslint-disable no-param-reassign */
    /* eslint-disable-next-line prefer-arrow-callback */
    $rootScope.$on('$routeChangeStart', function loadingOn() {
      $rootScope.loading = true;
    });

    /* eslint-disable-next-line prefer-arrow-callback */
    $rootScope.$on('$routeChangeSuccess', function loadingOff() {
      $rootScope.loading = false;
    });

    SharedState.initialize($scope, 'glucoseUnits', { defaultValue: $localStorage.glucoseUnits || 'mg/dL' });
    /* eslint-disable-next-line no-unused-vars, prefer-arrow-callback */
    $scope.$on('mobile-angular-ui.state.changed.glucoseUnits', function glucoseUnitsChanged(e, newVal, oldVal) {
      $localStorage.glucoseUnits = newVal;
    });
    /* eslint-enable no-param-reassign */
  }])

// app.controller('controller1', function($scope, SharedState){
//   SharedState.initialize($scope, 'myId');
// });


// $cookies.put('myFavorite', 'oatmeal');


  /* eslint-disable-next-line prefer-arrow-callback */
  .filter('time', function filterTime() {
    return function timeFilter(seconds) {
      if (!seconds) return '--';
      if (seconds < 60) return `${seconds.toFixed(0)} sec`;

      const minutes = seconds / 60;
      if (minutes < 60) return `${minutes.toFixed(0)} min`;

      const hours = minutes / 60;
      if (hours < 24) return `${hours.toFixed(0)} hr`;

      const days = hours / 24;
      return `${days.toFixed(0)} d`;
    };
  })

  .filter('glucose', ['SharedState', function filterGlucose(SharedState) {
    return function glucoseFilter(glucose, hideUnits) {
      const units = SharedState.get('glucoseUnits');
      if (!glucose) return '--';
      const unitsString = hideUnits ? '' : ` ${units}`;
      switch (units) {
        case 'mg/dL':
          return glucose.toFixed(0) + unitsString;
        case 'mmol/L':
          return `${(glucose / 18).toFixed(1)} ${unitsString}`;
        default:
          return 'ERR';
      }
    };
  }])

  .directive('glucose', ['SharedState', function glucoseDirective(SharedState) {
    return {
      restrict: 'A',
      require: 'ngModel',
      link: function linkGlucose(scope, element, attrs, ngModel) {
        // convert value going to user (model to view)
        ngModel.$formatters.push((value) => {
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
          return value / factor;
        });

        // value from the user (view to model)
        ngModel.$parsers.push((value) => {
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
          return Math.round(value * factor);
        });
      },
    };
  }]);
