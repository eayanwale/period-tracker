// Quick sanity check for cycle.js — run with: node test-cycle.mjs
import { buildPrediction, buildCalendarMonth } from './cycle.js';

const sampleDates = ['2026-06-03', '2026-07-02', '2026-07-30', '2026-08-28'];

const prediction = buildPrediction(sampleDates);
console.log('Prediction:', prediction);

console.assert(prediction.hasData === true, 'should have data');
console.assert(prediction.cycleLengths.length === 3, 'expects 3 cycle lengths');
console.assert(prediction.avgCycleLength > 0, 'avg cycle length should be positive');
console.assert(prediction.nextPeriodStart > prediction.lastPeriodStart, 'next period should be after last');

const [year, month] = prediction.nextPeriodStart.split('-').map(Number);
const calendar = buildCalendarMonth(year, month - 1, prediction);
const predictedDays = calendar.filter((d) => d.type === 'predicted-period');
console.assert(predictedDays.length > 0, 'calendar should mark predicted period days');

console.log('All checks passed.');
