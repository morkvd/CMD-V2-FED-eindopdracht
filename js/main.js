/* global d3, moment */

/* By Mark van Dijken */

d3.csv('../data/ovlog.csv', cleanUpOvData, plot);

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
function plot(rawData) {

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
        type: 'openbaar vervoer',
      };
    });
  }

  const ovTrips = ovDataToTrips(rawData);

  console.log(ovTrips);

  // creates time formating function (example from stackoverflow [4])'
  // nl locale definition
  const nl_NL = {
    'dateTime': '%a %e %B %Y %T',
    'date': '%d-%m-%Y',
    'time': '%H:%M:%S',
    'periods': ['AM', 'PM'],
    'days': ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'],
    'shortDays': ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'],
    'months': ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'],
    'shortMonths': ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
  }; // copied from d3 locales on github [5]

  // create a timeFormatLocale object
  const NL = d3.timeFormatLocale(nl_NL);

  // create timeFormatting functions from the timeFormatLocale object
  const formatTimeHMS = NL.format('%X');
  const formatTimeHM = NL.format('%H:%M');

  const scaleX = d3.scaleTime()
    .domain([ new Date('2016-09-19T00:00:00'), new Date('2016-09-20T00:00:00') ]) // (TODO: load dates from data instead of hard-coding it)
    .range([0, config.svg.width]);

  const xAxis = d3.axisBottom(scaleX)
    .ticks(24)
    .tickFormat(formatTimeHM);

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
    .text('00:00:00')
    .attr('fill', 'black')
    .attr('x', '-29')
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

  // translate timeSelectionIndicator to the position selected by the timeSelectionControl
  function updateTimeSelectionIndicator(selectedTimePosition) {
    timeSelectionIndicatorContainer.attr('transform', `translate(${ selectedTimePosition }, 0)`);
    timeSelectionIndicatorContainer.select('text').remove();
    timeSelectionIndicatorContainer.append('text')
      .text(formatTimeHMS(scaleX.invert(selectedTimePosition)))
      .attr('fill', 'black')
      .attr('x', '-30')
      .attr('y', '220')
      .attr('font-size', '16')
      .attr('font-family', 'Arial');
  }

  // draw the info box
  function drawInfoBox(selectedTimePosition) {
    const selectedDayPart = ovTrips.filter(d => {
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
        .text(`${ formatTimeHM(selectedDayPart[0].startDatetime) } - ${formatTimeHM(selectedDayPart[0].stopDatetime)}`);
      infoBoxContainer.selectAll('text')
        .attr('fill', 'black')
        .attr('x', '5')
        .attr('font-size', config.infobox.fontsize)
        .attr('font-family', 'Arial');
    }
    //console.log(selectedDayPart[0]);
  }

  // draw the time blocks
  function drawTimeBlocks() {
    const groupAll = chart.selectAll('.block').data(ovTrips);
    const groupAllEnter = groupAll.enter().append('g') // enter elements as groups [1]
      .attr('class', 'block');

    groupAllEnter.append('rect');
    groupAllEnter.select('rect')
      .attr('width', d =>  scaleX(d.end.toDate()) - scaleX(d.beginning.toDate()))
      .attr('x', d => scaleX(d.beginning.toDate()))
      .attr('y', config.svg.margin.y)
      .attr('height', config.bar.height)
      .attr('fill', d => colorScale(d.label));
    groupAll.exit().remove();
  }
}

// renames ov collumns / merges some fields
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
