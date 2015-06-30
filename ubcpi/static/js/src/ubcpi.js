/* Javascript for PeerInstructionXBlock. */

var generatePIXBlockId;
if (typeof generatePIXBlockId !== "function") {
    generatePIXBlockId = (function () {
        "use strict";
        var id = 0;
        return function () {
            return "ubcpi_" + (id += 1);
        };
    }());
}

function PeerInstructionXBlock(runtime, element, data) {
    "use strict";
    var notify;

    // The workbench doesn't support notifications.
    notify = $.proxy(runtime.notify, runtime) || function(){};

    $(function ($) {
        var appId = generatePIXBlockId();
        var app = angular.module(appId, ['nvd3ChartDirectives', 'ngSanitize']);
        app.run(function($http) {
            // set up CSRF Token from cookie. This is needed by all post requests
            $http.defaults.headers.post['X-CSRFToken'] = $.cookie('csrftoken');
        });

        app.directive('integer', function(){
            return {
                require: 'ngModel',
                link: function(scope, ele, attr, ctrl){
                    ctrl.$parsers.unshift(function(viewValue){
                        return parseInt(viewValue, 10);
                    });
                }
            };
        });

        app.controller('ReviseController', function ($scope, $http) {
            var self = this;

            $scope.appId = appId;
            $scope.question_text = data.question_text;
            $scope.options = data.options;
            $scope.rationale_size = data.rationale_size;
            $scope.chartDataOriginal = [
                {
                    'key': 'Original',
                    'color': '#33A6DC',
                    'values': []
                }
            ];
            $scope.chartDataRevised = [
                {
                    'key': 'Revised',
                    'color': '#50C67B',
                    'values': []
                }
            ];

            self.STATUS_NEW      = 0;
            self.STATUS_ANSWERED = 1;
            self.STATUS_REVISED  = 2;

            self.answer_original = data.answer_original;
            self.rationale_original = data.rationale_original;
            self.answer_revised = data.answer_revised;
            self.rationale_revised = data.rationale_revised;
            self.answer = self.answer_revised || self.answer_original;
            self.rationale = self.rationale_revised || self.rationale_original;
            self.submitting = false;
            self.other_answers = data.other_answers;
            self.correct_answer = data.correct_answer;
            self.correct_rationale = data.correct_rationale;

            function getStatus(answer_original, answer_revised) {
                if (typeof answer_original === 'undefined' || answer_original === null) {
                    return self.STATUS_NEW;
                } else if (typeof answer_revised === 'undefined' || answer_revised === null) {
                    return self.STATUS_ANSWERED;
                } else {
                    return self.STATUS_REVISED;
                }
            }

            self.status = function() {
                return getStatus(self.answer_original, self.answer_revised);
            };

            self.disableSubmit = function () {
                var haveAnswer = typeof self.answer !== "undefined" && self.answer !== null;
                var size = self.rationale.length;
                var haveRationale = size >= $scope.rationale_size.min &&
                    ($scope.rationale_size.max == '#' || size <= $scope.rationale_size.max);
                var enable = haveAnswer && haveRationale && !self.submitting;
                return !enable;
            };

            self.clickSubmit = function () {
                notify('save', {state: 'start', message: "Submitting"});
                self.submitting = true;

                var submitUrl = runtime.handlerUrl(element, 'submit_answer');
                var submitData = JSON.stringify({
                    "q": self.answer,
                    "rationale": self.rationale,
                    "status": self.status()
                });
                $http.post(submitUrl, submitData).
                    success(function(data, status, header, config) {
                        self.submitting = false;
                        self.answer_original = data.answer_original;
                        self.rationale_original = data.rationale_original;
                        self.answer_revised = data.answer_revised;
                        self.rationale_revised = data.rationale_revised;
                        self.other_answers = data.other_answers;
                        self.correct_answer = data.correct_answer;
                        self.correct_rationale = data.correct_rationale;
                        notify('save', {state: 'end'});
                    }).
                    error(function(data, status, header, config) {
                        notify('error', {
                            'title': 'Error submitting answer!',
                            'message': 'Please refresh the page and try again!'
                        });
                    });
            };

            self.createChart = function( data, containerSelector ) {

                var i;
                var modifiedData = [];

                for (i = 0; i < data.length; ++i) {
                    var thisFreq = data[i][1];
                    var thisLabel = 'Option ' + (i+1);

                    var thisObject = {};

                    thisObject.class = 'ubcpibar';
                    thisObject.frequency = thisFreq;

                    // If this is the 'correct' answer, then add that to the label
                    if ( self.correct_answer == (i) ) {
                        thisLabel += ' (correct option)';
                        thisObject.class = 'ubcpibar correct-answer';
                    }

                    thisObject.label = thisLabel;
                    modifiedData.push(thisObject);
                }

                data = modifiedData;

                // var dummyData = [
                //     {frequency: 20, label: 'Option 1', class: 'ubcpibar'},
                //     {frequency: 50, label: 'Option 2', class: 'ubcpibar'},
                //     {frequency: 5, label: 'Option 3 (correct option)', class: 'ubcpibar correct-answer'},
                //     {frequency: 45, label: 'Option 4', class: 'ubcpibar'},
                //     {frequency: 0, label: 'Option 5', class: 'ubcpibar'},
                // ];
                //
                // data = dummyData;

                var totalFreq = 0;
                var loopIndex = 0;

                // Calculate the total number of submissions
                for ( loopIndex = 0; loopIndex < data.length; ++loopIndex ) {
                    var thisFreq = data[loopIndex].frequency;
                    totalFreq += thisFreq;
                }

                // Layout
                var margin = {
                    top: 10,
                    right: 0,
                    bottom: 30,
                    left: 0
                };

                var width = 750 - margin.left - margin.right;
                var height = 250 - margin.top - margin.bottom;

                var svg = d3.select(containerSelector)
                    .append("svg")
                    .attr("width", width + margin.left + margin.right)
                    .attr("height", height + margin.top + margin.bottom);
                //
                var x = d3.scale.ordinal()
                    .rangeRoundBands([0, width], 0.1);

                var y = d3.scale.linear()
                    .range([height, 0]);

                var xAxis = d3.svg.axis()
                    .scale(x)
                    .orient("bottom");

                var yAxis = d3.svg.axis()
                    .scale(y)
                    .orient("left")
                    .ticks(10, "%");

                x.domain(data.map(function(d) { return d.label; }));
                y.domain([0, d3.max(data, function(d) { return d.frequency; })]);

                svg.append("g")
                    .attr("class", "x axis")
                    .attr("transform", "translate(0," + height + ")")
                    .call(xAxis);

                svg.append("g")
                    .attr("class", "y axis")
                    .call(yAxis)
                .append("text")
                    .attr("transform", "rotate(-90)")
                    .attr("y", 6)
                    .attr("dy", ".71em")
                    .style("text-anchor", "end")
                    .text("Frequency");

                var bars = svg.selectAll(".ubcpibar")
                    .data(data)
                    .enter()
                .append("g");

                bars.append("rect").attr("class", function(d,i){ return d.class; } )
                    .attr("x", function(d) { return x(d.label); })
                    .attr("width", x.rangeBand())
                    .attr("y", function(d) { return y(d.frequency); })
                    .attr("height", function(d) { return height - y(d.frequency); });

                bars.append("text")
                    .attr("x", function(d) { return x(d.label); })
                    .attr("y", function(d) { return y(d.frequency); })
                    .attr("dy", function(d) {

                        // If the frequency is 0, we don't want a dy
                        if ( d.frequency == 0 ) {
                            return "-0.5em";
                        }

                        return "1.25em";

                    } )
                    .attr("dx", (x.rangeBand()/2)-15 + "px" )
                    .text( function(d){

                        var percentage = (d.frequency/totalFreq) * 100;
                        var rounded = Math.round( percentage*10 )/10;
                        return rounded.toFixed(1) + '%';
                    } );

            };

            self.getStats = function() {
                var statsUrl = runtime.handlerUrl(element, 'get_stats');
                $http.post(statsUrl, '""').
                    success(function(data, status, header, config) {

                        self.stats = data;
                        $scope.chartDataOriginal[0].values = [];
                        $scope.chartDataOriginal[0].data = [];
                        $scope.chartDataOriginal[0].originalData = [];
                        $scope.chartDataRevised[0].values = [];
                        $scope.chartDataRevised[0].revisedData = [];
                        for (var i = 0; i < $scope.options.length; i++) {
                            var count = 0;
                            if (i in data.original) {
                                count = data.original[i];
                            }
                            $scope.chartDataOriginal[0].values.push([$scope.options[i], count]);
                            $scope.chartDataOriginal[0].data.push( { name: $scope.options[i], value: count } );
                            $scope.chartDataOriginal[0].originalData.push( [$scope.options[i],count] );

                            count = 0;
                            if (i in data.revised) {
                                count = data.revised[i];
                            }
                            $scope.chartDataRevised[0].values.push([$scope.options[i], count]);
                            $scope.chartDataRevised[0].revisedData.push( [$scope.options[i],count] );
                        }

                        self.createChart( $scope.chartDataOriginal[0].originalData, '#original-bar-chart' );
                        self.createChart( $scope.chartDataRevised[0].revisedData, '#revised-bar-chart' );

                    }).
                    error(function(data, status, header, config) {
                        notify('error', {
                            'title': 'Error retrieving statistics!',
                            'message': 'Please refresh the page and try again!'
                        });
                    });
            };

        });
        angular.bootstrap(element, [appId]);
    });
}
