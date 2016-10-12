/* global d3, moment */

/* By Mark van Dijken */

// load data from multiple sources concurrently and call plot when they're all finished
// example taken from stackoverflow [6]
d3.queue()
  .defer(d3.csv, '../data/ovlog.csv', cleanUpOvData)
  .defer(d3.csv, '../data/school_schedule.csv', cleanUpSchoolData)
  .await((error, ovData, schoolData) => {
    if (error) {
      console.error('problem loading data: ' + error);
    }
    else {
      plot(ovData, schoolData);
    }
  });

// settings object
const config = {
  svg: {
    width: 1400,
    height: 260,
    margin: {
      x: 60,
      y: 60,
    },
  },
  bar: {
    height: 100,
    margin: 10,
  },
  slider: {
    offset: 4,
    padding: 13,
  },
  infobox: {
    lineheight: 16,
    fontsize: '0.71em', // same as axis font-size
  }
};


// draw the visualisation
function plot(rawOvData, rawSchoolData) {

  // setup work

  // turn checkin and checkout events into trips with a beginning and an end
  function ovDataToTrips(ovData) {
    const ovCheckins = ovData.filter(d => d.type === 'Check-in');
    const ovCheckouts = ovData.filter(d => d.type === 'Check-uit');
    return ovCheckouts.map((item, i) => {
      const date = item.date;
      return {
        date: date,
        description: `${item.origin} - ${item.destination}`,
        beginning: moment(`${date} ${ovCheckins[i].time}`, 'YYYY-MM-DD HH:mm'),
        end: moment(`${date} ${item.time}`,'YYYY-MM-DD HH:mm'),
        label: 'openbaar vervoer',
      };
    });
  }

  const ovTrips = ovDataToTrips(rawOvData);

  // nest the data by day for easy access
  const nestedByDay = d3.nest()
    .key(d => d.date)
    .entries(Array.concat(ovTrips, rawSchoolData));

  // 1. map


  const selectedDateOutput = document.querySelector('#selectedDateOutput');
  const previousDayControl = document.querySelector('#previousDayControl');
  const nextDayControl = document.querySelector('#nextDayControl');

  let selectedDayN = 11;
  selectedDateOutput.textContent = nestedByDay[selectedDayN % nestedByDay.length].key;
  let currentDay = nestedByDay[selectedDayN % nestedByDay.length];
  let currentDayParts = currentDay.values;
  let startOfSelectedDateStr = moment(currentDay.key, 'YYYY-MM-DD');
  let endOfSelectedDateStr = moment(startOfSelectedDateStr).add(1, 'days');

  function updateCurrentDayValues() {
    currentDay = nestedByDay[selectedDayN % nestedByDay.length];
    currentDayParts = currentDay.values;
    startOfSelectedDateStr = moment(currentDay.key, 'YYYY-MM-DD');
    endOfSelectedDateStr = moment(startOfSelectedDateStr).add(1, 'days');
    console.log(
      'selectedDayN:', selectedDayN,
      'currentDay:', currentDay,
      'currentDayParts', currentDayParts,
      'startOfSelectedDateStr:', startOfSelectedDateStr.format(),
      'endOfSelectedDateStr:', endOfSelectedDateStr.format()
    );
  }

  previousDayControl.addEventListener('click', () => {
    selectedDateOutput.textContent = moment(
      nestedByDay[ --selectedDayN % nestedByDay.length].key,
      'YYYY-MM-DD'
    );
    updateCurrentDayValues();
    redrawScale();
    drawTimeBlocks();
  });

  nextDayControl.addEventListener('click', () => {
    selectedDateOutput.textContent = moment(
      nestedByDay[ ++selectedDayN % nestedByDay.length].key,
      'YYYY-MM-DD'
    );
    updateCurrentDayValues();
    redrawScale();
    drawTimeBlocks();
  });

  // create timeFormatting functions from the timeFormatLocale object
  const formatTimeHM = d3.timeFormat('%H:%M');

  const scaleX = d3.scaleTime()
    .domain([
      startOfSelectedDateStr.toDate(),
      endOfSelectedDateStr.toDate()
    ]) // (TODO: load dates from data instead of hard-coding it)
    .range([0, config.svg.width]);

  const xAxis = d3.axisBottom(scaleX)
    .ticks(24)
    .tickFormat(formatTimeHM); // temp disable to see effects of changing scale

  // grab all labels from data, sort them, then remove all duplicate stings
  const uniqueLabels = ovTrips.map(d => d.label)
    .sort()
    .filter(removeDuplicates);

  // create a scale which maps all possible label values to `d3.schemeCategory10` colors
  const colorScale = d3.scaleOrdinal()
    .domain(uniqueLabels)
    .range(d3.schemeCategory10);

  // setup chart
  const chart = d3.select('svg')
    .attr('class', 'chart')
    .attr('width', config.svg.width + config.svg.margin.x)
    .attr('height', config.svg.height + config.svg.margin.y)
      .append('g')
    .attr('transform', `translate(${ config.svg.margin.x / 2 }, ${ config.svg.margin.y })`);

  // add x-axis
  chart.append('g')
    .attr('class', 'xAxis')
    .attr('transform', `translate(0, ${config.svg.margin.y + config.bar.height + config.bar.margin})`)
    .call(xAxis);

  // setup range input for date selection
  d3.select('#timeSelectionControl')
    .attr('type', 'range')
    .attr('min', 0)
    .attr('max', config.svg.width)
    .attr('value', 0)
    .style('width', `${ config.svg.width + config.slider.padding }px`)
    .style('margin', `0 ${ config.svg.margin.y / 2 + config.slider.offset }px`);

  // input element that controls currently selected time
  const timeSelectionControl = document.querySelector('#timeSelectionControl');

  timeSelectionControl.addEventListener('input', onTimeSelectionChange);

  drawTimeBlocks();

  // setup the timeSelectionIndicator
  const timeSelectionIndicatorContainer = chart.append('g')
    .attr('class', 'timeSelectionIndicator');

  timeSelectionIndicatorContainer.append('rect')
    .attr('width', 2)
    .attr('x', 0)
    .attr('y', -8)
    .attr('height', 210)
    .attr('fill', 'red');

  timeSelectionIndicatorContainer.append('text')
    .text('00:00')
    .attr('fill', 'black')
    .attr('x', '-19')
    .attr('y', '220')
    .attr('font-size', '16')
    .attr('font-family', 'Arial');

  // setup infoBox
  const infoBoxContainer = chart.append('g')
    .attr('class', 'infoBox');

  // runs every time the range input is moved
  function onTimeSelectionChange() {
    drawTimeBlocks();
    drawInfoBox(timeSelectionControl.value);
    updateTimeSelectionIndicator(timeSelectionControl.value);
  }

  function redrawScale() {
    scaleX.domain([
      startOfSelectedDateStr.toDate(),
      endOfSelectedDateStr.toDate()
    ]);
    chart.select('.xAxis')
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
      .attr('y', '220')
      .attr('font-size', '16')
      .attr('font-family', 'Arial');
  }

  // draw the info box
  function drawInfoBox(selectedTimePosition) {
    const selectedDayPart = currentDayParts.filter(d => {
      return (scaleX(d.beginning.toDate()) < selectedTimePosition &&
              selectedTimePosition < scaleX(d.end.toDate()));
    });
    infoBoxContainer.attr('transform', `translate(${ selectedTimePosition }, 0)`);
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
    } //console.log(selectedDayPart[0]);
  }

  // draw the time blocks
  function drawTimeBlocks() {
    console.log(currentDayParts);
    chart.selectAll('.block').remove();
    const groupAll = chart.selectAll('.block').data(currentDayParts);
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

function cleanUpOvData(row) {
  const checkinTime = row['Check-in'] ? row['Check-in'] : null;
  const checkoutTime = row['Check-uit'] ? row['Check-uit'] : null;
  return {
    type: row.Transactie,
    time: checkinTime || checkoutTime, // return checkin if it exists
    date: row.Datum.split('-').reverse().join('-'),
    origin: row.Vertrek,
    destination: row.Bestemming ? row.Bestemming : null, // return checkout if it exists
  };
}

function cleanUpSchoolData(row) {
  const date = row['Start date'];
  return {
    label: 'School',
    description: `${row.Activity} @ ${row.Location}`,
    date: date,
    beginning: moment( `${date} ${row['Start time']}`, 'YYYY-MM-DD HH:mm'),
    end: moment( `${date} ${row['End time']}`, 'YYYY-MM-DD HH:mm'),
  };
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
