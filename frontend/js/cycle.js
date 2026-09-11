// cycle.js
// Pure calculation logic for period/cycle predictions.
// No DOM, no network calls — takes plain data in, returns plain data out,
// so it can be unit-tested on its own (see test-cycle.mjs).

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CYCLE_LENGTH = 28; // used only until there's enough history
const DEFAULT_PERIOD_LENGTH = 5;
const LUTEAL_PHASE_LENGTH = 14; // days between ovulation and next period (fairly constant even in irregular cycles)
const FERTILE_WINDOW_DAYS_BEFORE_OVULATION = 5;

/** Parse 'YYYY-MM-DD' as a local date (avoids UTC off-by-one issues). */
function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/**
 * @param {string[]} logDates - period start dates as 'YYYY-MM-DD', any order.
 * @returns {string[]} sorted ascending, de-duplicated.
 */
function sortDates(logDates) {
  const unique = [...new Set(logDates)];
  return unique.sort();
}

/**
 * Cycle length = days between consecutive period start dates.
 * @returns {number[]}
 */
function computeCycleLengths(sortedLogDates) {
  const lengths = [];
  for (let i = 1; i < sortedLogDates.length; i++) {
    const prev = parseDate(sortedLogDates[i - 1]);
    const curr = parseDate(sortedLogDates[i]);
    lengths.push(daysBetween(prev, curr));
  }
  return lengths;
}

/**
 * Average of the most recent N cycle lengths (recent cycles predict better
 * than very old ones). Falls back to DEFAULT_CYCLE_LENGTH with fewer than
 * 2 logged dates.
 */
function averageCycleLength(cycleLengths, recentCount = 6) {
  if (cycleLengths.length === 0) return DEFAULT_CYCLE_LENGTH;
  const recent = cycleLengths.slice(-recentCount);
  const sum = recent.reduce((a, b) => a + b, 0);
  return Math.round(sum / recent.length);
}

/** Standard deviation of cycle lengths, rounded — used to show a +/- range. */
function cycleLengthVariance(cycleLengths) {
  if (cycleLengths.length < 2) return 0;
  const mean = cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length;
  const variance =
    cycleLengths.reduce((sum, len) => sum + (len - mean) ** 2, 0) / cycleLengths.length;
  return Math.round(Math.sqrt(variance));
}

/**
 * Builds the full prediction summary from a raw list of logged period
 * start dates.
 */
function buildPrediction(logDates, periodLength = DEFAULT_PERIOD_LENGTH) {
  const sorted = sortDates(logDates);
  if (sorted.length === 0) {
    return {
      hasData: false,
      sortedDates: [],
      cycleLengths: [],
      avgCycleLength: DEFAULT_CYCLE_LENGTH,
      variance: 0,
      lastPeriodStart: null,
      nextPeriodStart: null,
      nextPeriodEnd: null,
      fertileWindowStart: null,
      fertileWindowEnd: null,
      ovulationEstimate: null,
    };
  }

  const cycleLengths = computeCycleLengths(sorted);
  const avgCycleLength = averageCycleLength(cycleLengths);
  const variance = cycleLengthVariance(cycleLengths);

  const lastPeriodStart = parseDate(sorted[sorted.length - 1]);
  const nextPeriodStart = addDays(lastPeriodStart, avgCycleLength);
  const nextPeriodEnd = addDays(nextPeriodStart, periodLength - 1);

  const ovulationEstimate = addDays(nextPeriodStart, -LUTEAL_PHASE_LENGTH);
  const fertileWindowStart = addDays(ovulationEstimate, -FERTILE_WINDOW_DAYS_BEFORE_OVULATION);
  const fertileWindowEnd = addDays(ovulationEstimate, 1);

  return {
    hasData: true,
    sortedDates: sorted,
    cycleLengths,
    avgCycleLength,
    variance,
    lastPeriodStart: formatDate(lastPeriodStart),
    nextPeriodStart: formatDate(nextPeriodStart),
    nextPeriodEnd: formatDate(nextPeriodEnd),
    fertileWindowStart: formatDate(fertileWindowStart),
    fertileWindowEnd: formatDate(fertileWindowEnd),
    ovulationEstimate: formatDate(ovulationEstimate),
  };
}

/**
 * Builds a day-by-day map for a given month (for the calendar view),
 * tagging each date as 'logged', 'predicted-period', 'fertile', or null.
 * @param {number} year
 * @param {number} monthIndex - 0-based (0 = January)
 */
function buildCalendarMonth(year, monthIndex, prediction, periodLength = DEFAULT_PERIOD_LENGTH) {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const loggedSet = new Set(prediction.sortedDates);

  // Mark every day within periodLength days after a logged start as 'logged-range'.
  const loggedRangeSet = new Set();
  for (const d of prediction.sortedDates) {
    const start = parseDate(d);
    for (let i = 0; i < periodLength; i++) {
      loggedRangeSet.add(formatDate(addDays(start, i)));
    }
  }

  const predictedRangeSet = new Set();
  if (prediction.nextPeriodStart) {
    const start = parseDate(prediction.nextPeriodStart);
    for (let i = 0; i < periodLength; i++) {
      predictedRangeSet.add(formatDate(addDays(start, i)));
    }
  }

  const fertileSet = new Set();
  if (prediction.fertileWindowStart && prediction.fertileWindowEnd) {
    let cursor = parseDate(prediction.fertileWindowStart);
    const end = parseDate(prediction.fertileWindowEnd);
    while (cursor <= end) {
      fertileSet.add(formatDate(cursor));
      cursor = addDays(cursor, 1);
    }
  }

  const days = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = formatDate(new Date(year, monthIndex, day));
    let type = null;
    if (loggedSet.has(dateStr)) type = 'logged-start';
    else if (loggedRangeSet.has(dateStr)) type = 'logged-range';
    else if (predictedRangeSet.has(dateStr)) type = 'predicted-period';
    else if (fertileSet.has(dateStr)) type = 'fertile';
    days.push({ date: dateStr, day, type });
  }
  return days;
}

export {
  parseDate,
  formatDate,
  addDays,
  daysBetween,
  sortDates,
  computeCycleLengths,
  averageCycleLength,
  cycleLengthVariance,
  buildPrediction,
  buildCalendarMonth,
  DEFAULT_CYCLE_LENGTH,
  DEFAULT_PERIOD_LENGTH,
};
