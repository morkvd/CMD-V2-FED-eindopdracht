/* global d3, moment */

/**********************/
/* By Mark van Dijken */
/**********************/


// # QUANTIFIED SELF DASHBOARD WITH D3 #


// ## LOADING... ##
// load data from multiple sources concurrently, clean them up a bit
// and call plot when they're all finished
// (example taken from stackoverflow [6])
d3.queue()
  .defer(d3.csv, '../data/ovlog.csv', cleanUpOvData)
  .defer(d3.csv, '../data/school_schedule.csv', cleanUpSchoolData)
  .defer(d3.tsv, '../data/slaap.tsv', cleanUpSleepData)
  .defer(d3.tsv, '../data/emotie.tsv', cleanUpEmotionData)
  .await((error, ovData, schoolData, sleepData, emotionData) => {
    if (error) {
      console.error(`problem loading data: ${error}`);
    } else {
      plot(combineOvDataToTrips(ovData), schoolData, sleepData, emotionData);
    }
  });


// ## SETTINGS ##
// setting up the settings
const config = {
  svg: {
    width: 1400,
    height: 660,
    margin: {
      x: 60,
      y: 200,
    },
  },
  bar: {
    height: 100,
    margin: 10,
  },
  slider: {
    offset: 23,
    padding: 13,
  },
  indicatorLine: {
    height: 185,
    offsetVert: 20,
    timePos: 355,
  },
  infobox: {
    lineheight: 16,
    fontsize: '0.71em', // same as axis font-size
  },
  emotions: {
    height: 300,
  }
};


// ## DATA CLEANUP CREW ##
// processing data to make it easier to handle

// cleaup data from '../data/ovlog.csv'
function cleanUpOvData(row) {
  const checkinTime = row['Check-in'];
  const checkoutTime = row['Check-uit'];
  return {
    type: row.Transactie,
    time: checkinTime || checkoutTime, // return checkin if it exists
    date: row.Datum.split('-').reverse().join('-'),
    origin: row.Vertrek,
    destination: row.Bestemming, // return checkout if it exists
  };
}

// additional ovData processing that cant be done with only access to rows
// turns check-in and check-out events into time periods with a beginning and an end
function combineOvDataToTrips(ovData) {
  const ovCheckins = ovData.filter(d => d.type === 'Check-in');
  const ovCheckouts = ovData.filter(d => d.type === 'Check-uit');
  return ovCheckouts.map((item, i) => {
    const date = item.date;
    return {
      type: 'timeline',
      label: 'openbaar vervoer',
      description: `${item.origin} - ${item.destination}`,
      date: date,
      beginning: moment(`${date} ${ovCheckins[i].time}`, 'YYYY-MM-DD HH:mm'),
      end: moment(`${date} ${item.time}`,'YYYY-MM-DD HH:mm'),
    };
  });
}

// cleaup data from '../data/school_schedule.csv'
function cleanUpSchoolData(row) {
  const date = row['Start date'];
  return {
    type: 'timeline',
    label: 'school',
    description: `${row.Activity} @ ${row.Location}`,
    date: date,
    beginning: moment( `${date} ${row['Start time']}`, 'YYYY-MM-DD HH:mm'),
    end: moment( `${date} ${row['End time']}`, 'YYYY-MM-DD HH:mm'),
  };
}

// cleanuo data from 'sleep.tsv'
function cleanUpSleepData(row) {
  const date = moment( row.Slaap, 'M/D/YY').format('YYYY-MM-DD');
  return {
    type: 'timeline',
    label: 'slaap',
    description: 'ZZzzZZzz',
    date: date,
    beginning: moment(`${date} ${row['Start Slaap Tijd']}`, 'YYYY-MM-DD HH:mm'),
    end: moment(`${date} ${row['Laatste Wekker Tijd']}`, 'YYYY-MM-DD HH:mm'),
  };
}

function cleanUpEmotionData(row) {
  const date = moment(row.Emotie, 'M/D/YY').format('YYYY-MM-DD');
  return {
    type: 'emotion',
    label: 'emotie',
    description: row.Wat,
    date: date,
    arousal: row.Arousal,
    valence: row.Valance,
    time: moment(`${date} ${row.Tijd}`, 'YYYY-MM-DD HHmm'),
  };
}


// ## PLOTTING AND SCHEMING ##
// processing data to make it easier to handle

// draw the visualisation
function plot(ovTrips, schoolData, sleepData, emotionData) {

  // nest the data by day for easy access
  // sorting function from
  // http://stackoverflow.com/questions/28013045/sort-array-by-date-gives-unexpected-results
  const dayPartNestedByDay = d3.nest()
    .key(d => d.date)
    .entries(Array.concat(ovTrips, schoolData, sleepData))
    .sort((left, right) => {
      return moment.utc(left.key).diff(moment.utc(right.key));
    });

  const emotionsNestedByDay = d3.nest()
    .key(d => d.date)
    .entries(emotionData)
    .sort((left, right) => {
      return moment.utc(left.key).diff(moment.utc(right.key));
    });

  // this can probably be done in a smarter way
  const intersectedDayParts = dayPartNestedByDay.filter((value) => {
    return emotionsNestedByDay.map(d => d.key).indexOf(value.key) > -1;
  });

  const intersectedEmotions = emotionsNestedByDay.filter((value) => {
    return dayPartNestedByDay.map(d => d.key).indexOf(value.key) > -1;
  });

  // setup date selection controls
  const selectedDateOutput = document.querySelector('#selectedDateOutput');
  const previousDayControl = document.querySelector('#previousDayControl');
  const nextDayControl = document.querySelector('#nextDayControl');

  // make formatter for the date that is printed at the top of the visualisation
  function formatSelectedDay(selectedDayDate) {
    return moment(
      selectedDayDate,
      'YYYY-MM-DD'
    ).locale('nl').format('dddd, D MMMM YYYY');
  }

  // initialize variables for the selected day and
  // all dynamic data that is dependent on the selected date
  let selectedDayN = 6; // initialize selected day number
  let currentDayTimeline = intersectedDayParts[selectedDayN % intersectedDayParts.length];
  let currentDayEmotion = intersectedEmotions[selectedDayN % intersectedEmotions.length];

  selectedDateOutput.textContent = formatSelectedDay(currentDayTimeline.key); // key == date (see nest function)
  let currentDayParts = currentDayTimeline.values;
  let currentDayEmotions = currentDayEmotion.values;
  let startOfSelectedDateStr = moment(currentDayTimeline.key, 'YYYY-MM-DD');
  let endOfSelectedDateStr = moment(startOfSelectedDateStr).add(1, 'days');

  // update the values that need to change when selectedDayN is changed
  function updateCurrentDayValues() {
    currentDayTimeline = intersectedDayParts[selectedDayN % intersectedDayParts.length];
    currentDayEmotion = intersectedEmotions[selectedDayN % intersectedEmotions.length];
    currentDayParts = currentDayTimeline.values;
    currentDayEmotions = currentDayEmotion.values;

    startOfSelectedDateStr = moment(currentDayTimeline.key, 'YYYY-MM-DD');
    endOfSelectedDateStr = moment(startOfSelectedDateStr).add(1, 'days');
  }

  previousDayControl.addEventListener('click', () => {
    --selectedDayN; // move one day back
    updateCurrentDayValues();
    selectedDateOutput.textContent = formatSelectedDay(currentDayTimeline.key);
    redrawScale();
    drawTimeBlocks();
    drawEmotions();
    drawInfoBox(timeSelectionControl.value);
    d3.select('.timelineLabel').text('Dagindeling van ' + formatSelectedDay(currentDayTimeline.key));
  });

  nextDayControl.addEventListener('click', () => {
    ++selectedDayN; // move one day forward
    updateCurrentDayValues();
    selectedDateOutput.textContent = formatSelectedDay(currentDayTimeline.key);
    redrawScale();
    drawTimeBlocks();
    drawEmotions();
    drawInfoBox(timeSelectionControl.value);
    d3.select('.timelineLabel').text('Dagindeling van ' + formatSelectedDay(currentDayTimeline.key));
  });


  // create timeFormatting function for the x-axis
  const formatTimeHM = d3.timeFormat('%H:%M');

  // construct the scale for the x-axis
  const scaleX = d3.scaleTime()
    .domain([
      startOfSelectedDateStr.toDate(),
      endOfSelectedDateStr.toDate()
    ])
    .range([0, config.svg.width]);

  // create x-axis
  const xAxis = d3.axisBottom(scaleX)
    .ticks(24)
    .tickFormat(formatTimeHM);


  // EMOTIONS
  const scaleY = d3.scaleLinear()
    .domain([10, 0])
    .range([0, config.emotions.height]);

  const yAxis = d3.axisLeft(scaleY)
    .ticks(10);

  const emotionsChart = d3.select('svg').append('g')
    .attr('class', 'emotions')
    .attr('width', config.svg.width + config.svg.margin.x)
    .attr('height', config.svg.height + (config.svg.margin.y / 2) )
      .append('g')
    .attr('transform', `translate(${ (config.svg.margin.x / 2) + 10  }, ${ 20 })`);

  emotionsChart.append('g')
    .attr('class', 'xAxis')
    .attr('transform', `translate(0, ${config.svg.margin.y + config.bar.height + config.bar.margin})`)
    .call(xAxis);

  const yAxisGroup = emotionsChart.append('g')
    .attr('class', 'yAxis')
    .call(yAxis);

  yAxisGroup.append('text')
    .attr('fill', 'black')
    .attr('text-anchor', 'start')
    .attr('x', 14)
    .attr('y', 3)
    .attr('font-size', '10')
    .attr('font-family', 'Arial')
    .text('humeur op een schaal van 0 - 10');

  function drawEmotions() {
    emotionsChart.selectAll('.emote').remove();
    const groupAll = emotionsChart.selectAll('.emote').data(currentDayEmotions);
    const groupAllEnter = groupAll.enter().append('g') // enter elements as groups [1]
      .attr('class', 'emote');

    const line = d3.line()
      .x((d) => scaleX(d.time.toDate()))
      .y((d) => scaleY(d.valence));

    groupAllEnter.append('path')
      .datum(currentDayEmotions)
      .attr('class', 'line')
      .attr('fill', 'none')
      .attr('stroke', 'black')
      .attr('shape-rendering', 'auto')
      .attr('stroke-width', '1.9px')
      .attr('d', line);
  }


  // TIMELINE

  // grab all labels from data, sort them, then remove all duplicate stings
  const uniqueLabels = ovTrips.map(d => d.label)
    .sort()
    .filter(removeDuplicates);

  // create a scale which maps all possible label values to the `d3.schemeCategory10` colors
  const colorScale = d3.scaleOrdinal()
    .domain(uniqueLabels)
    .range(d3.schemeCategory10);

  // setup timeline
  const timeline = d3.select('svg')
    .attr('class', 'timeline')
    .attr('width', config.svg.width + config.svg.margin.x)
    .attr('height', config.svg.height + (config.svg.margin.y / 2) )
      .append('g')
    .attr('transform', `translate(${ (config.svg.margin.x / 2) + 10 }, ${ config.svg.margin.y + 50})`);

  // add x-axis
  timeline.append('g')
    .attr('class', 'xAxis')
    .attr('transform', `translate(0, ${config.svg.margin.y + config.bar.height + config.bar.margin})`)
    .call(xAxis);

  timeline.append('text')
    .attr('class', 'timelineLabel')
    .attr('fill', 'black')
    .attr('text-anchor', 'start')
    .attr('x', 14)
    .attr('y', 143)
    .attr('font-size', '10')
    .attr('font-family', 'Arial')
    .text('Dagindeling van ' + formatSelectedDay(currentDayTimeline.key));

  // setup range input for date selection
  d3.select('#timeSelectionControl')
    .attr('type', 'range')
    .attr('min', 0)
    .attr('max', config.svg.width)
    .attr('value', 0)
    .style('width', `${ config.svg.width + config.slider.padding }px`)
    .style('margin', `0 ${ config.slider.offset + 10 }px`);

  // input element that controls currently selected time
  const timeSelectionControl = document.querySelector('#timeSelectionControl');
  timeSelectionControl.addEventListener('input', onTimeSelectionChange);

  // draw initial timeblocks
  drawTimeBlocks();
  drawEmotions();

  // setup the timeSelectionIndicator
  const timeSelectionIndicatorContainer = timeline.append('g')
    .attr('class', 'timeSelectionIndicator');

  timeSelectionIndicatorContainer.append('rect')
    .attr('width', 2)
    .attr('x', 0)
    .attr('y', config.svg.margin.y - 50)
    .attr('height', config.indicatorLine.height)
    .attr('fill', 'red');

  timeSelectionIndicatorContainer.append('text')
    .text('00:00')
    .attr('fill', 'black')
    .attr('x', '-19')
    .attr('y', config.indicatorLine.timePos)
    .attr('font-size', '16')
    .attr('font-family', 'Arial');

  // setup infoBox
  const infoBoxContainer = timeline.append('g')
    .attr('class', 'infoBox');

  // runs every time the range input is moved
  function onTimeSelectionChange() {
    drawTimeBlocks();
    drawInfoBox(timeSelectionControl.value);
    updateTimeSelectionIndicator(timeSelectionControl.value);
  }

  // redraw the x-axis to update the scale
  function redrawScale() {
    scaleX.domain([
      startOfSelectedDateStr.toDate(),
      endOfSelectedDateStr.toDate()
    ]);
    timeline.select('.xAxis')
      .call(xAxis);
    // https://gist.github.com/phoebebright/3098488
  }

  // translate timeSelectionIndicator to the position selected by the timeSelectionControl
  function updateTimeSelectionIndicator(selectedTimePosition) {
    timeSelectionIndicatorContainer.attr('transform', `translate(${ selectedTimePosition }, 0)`);
    timeSelectionIndicatorContainer.select('text').remove();
    timeSelectionIndicatorContainer.append('text')
      .text(moment(scaleX.invert(selectedTimePosition)).format('HH:mm'))
      .attr('fill', 'black')
      .attr('x', '-19')
      .attr('y', config.indicatorLine.timePos)
      .attr('font-size', '16')
      .attr('font-family', 'Arial');
  }

  // draw the info box
  function drawInfoBox(selectedTimePosition) {
    const selectedDayPart = currentDayParts.filter(d => {
      return (scaleX(d.beginning.toDate()) < selectedTimePosition &&
              selectedTimePosition < scaleX(d.end.toDate()));
    });
    infoBoxContainer.attr('transform', `translate(${ selectedTimePosition }, 160)`);
    infoBoxContainer.selectAll('text').remove();
    if (selectedDayPart[0]) {
      infoBoxContainer.append('text')
        .attr('y', 0)
        .text(selectedDayPart[0].label);
      infoBoxContainer.append('text')
        .attr('y', config.infobox.lineheight)
        .text(selectedDayPart[0].description);
      infoBoxContainer.append('text')
        .attr('y', config.infobox.lineheight * 2)
        .text(`${ moment(selectedDayPart[0].beginning).format('HH:mm') } - ${moment(selectedDayPart[0].end).format('HH:mm')}`);
      infoBoxContainer.selectAll('text')
        .attr('fill', 'black')
        .attr('x', '5')
        .attr('font-size', config.infobox.fontsize)
        .attr('font-family', 'Arial');
    }
  }

  // draw the time blocks
  function drawTimeBlocks() {
    timeline.selectAll('.block').remove();
    const groupAll = timeline.selectAll('.block').data(currentDayParts);
    const groupAllEnter = groupAll.enter().append('g') // enter elements as groups [1]
      .attr('class', 'block');
    groupAllEnter.append('rect');
    groupAllEnter.select('rect')
      .attr('width', d =>  scaleX(d.end.toDate()) - scaleX(d.beginning.toDate()))
      .attr('x', d => scaleX(d.beginning.toDate()))
      .attr('y', config.svg.margin.y)
      .attr('height', config.bar.height)
      .attr('fill', d => colorScale(d.label))
      .attr('opacity', '0.3');
  }
}

// filters out strings that are the same as their predecessor [2]
function removeDuplicates(item, pos, arr) {
  return !pos || item != arr[pos - 1];
}

// sources:
// [1] http://stackoverflow.com/questions/24912274/d3-update-data-with-multiple-elements-in-a-group
// [2] http://stackoverflow.com/questions/9229645/remove-duplicates-from-javascript-array
// [3] http://stackoverflow.com/questions/814564/inserting-html-elements-with-javascript
// [4] http://stackoverflow.com/questions/24385582/localization-of-d3-js-d3-locale-example-of-usage
// [5] https://github.com/d3/d3-time-format/blob/master/locale/nl-NL.json
// [6] http://stackoverflow.com/questions/21842384/importing-data-from-multiple-csv-files-in-d3
