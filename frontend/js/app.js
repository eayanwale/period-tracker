import { buildPrediction, buildCalendarMonth, formatDate, daysBetween, parseDate } from './cycle.js';
import { fetchDates, addDate, deleteDate, verifyPasscode, getSavedPasscode, savePasscode } from './api.js';
import { PERIOD_LENGTH_DAYS } from './config.js';

const gateEl = document.getElementById('gate');
const gateForm = document.getElementById('gate-form');
const passcodeInput = document.getElementById('passcode-input');
const gateError = document.getElementById('gate-error');
const appEl = document.getElementById('app');

let dates = [];
let calendarCursor = new Date(); // month currently shown

// ---------- Auth gate ----------

async function tryUnlock(passcode) {
  gateError.hidden = true;
  const ok = await verifyPasscode(passcode).catch(() => false);
  if (!ok) {
    gateError.hidden = false;
    return;
  }
  savePasscode(passcode);
  gateEl.hidden = true;
  appEl.hidden = false;
  await loadAndRender();
}

gateForm.addEventListener('submit', (e) => {
  e.preventDefault();
  tryUnlock(passcodeInput.value.trim());
});

// Auto-unlock if a passcode was already saved on this device.
(async function init() {
  const saved = getSavedPasscode();
  if (saved) {
    const ok = await verifyPasscode(saved).catch(() => false);
    if (ok) {
      gateEl.hidden = true;
      appEl.hidden = false;
      await loadAndRender();
      return;
    }
  }
})();

// ---------- Data loading ----------

async function loadAndRender() {
  try {
    dates = await fetchDates();
  } catch (err) {
    console.error('Failed to load dates', err);
    dates = [];
  }
  renderToday();
  renderCalendar();
  renderHistory();
}

// ---------- Today view ----------

function renderToday() {
  const prediction = buildPrediction(dates, PERIOD_LENGTH_DAYS);

  const nextDateEl = document.getElementById('next-period-date');
  const relativeEl = document.getElementById('next-period-relative');
  const fertileEl = document.getElementById('fertile-window');
  const avgEl = document.getElementById('avg-cycle-length');
  const varEl = document.getElementById('cycle-variance');
  const countEl = document.getElementById('logged-count');

  if (!prediction.hasData) {
    nextDateEl.textContent = 'Log a date to start';
    relativeEl.textContent = '';
    fertileEl.textContent = '—';
    avgEl.textContent = '—';
    varEl.textContent = '—';
    countEl.textContent = '0';
    return;
  }

  nextDateEl.textContent = formatDisplayDate(prediction.nextPeriodStart);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = daysBetween(today, parseDate(prediction.nextPeriodStart));
  if (diff > 0) {
    relativeEl.textContent = `in ${diff} day${diff === 1 ? '' : 's'}`;
  } else if (diff === 0) {
    relativeEl.textContent = 'today';
  } else {
    relativeEl.textContent = `${Math.abs(diff)} day${diff === -1 ? '' : 's'} late — worth logging when it starts`;
  }

  fertileEl.textContent = `${formatDisplayDate(prediction.fertileWindowStart)} – ${formatDisplayDate(prediction.fertileWindowEnd)}`;
  avgEl.textContent = prediction.avgCycleLength;
  varEl.textContent = prediction.cycleLengths.length > 1 ? `±${prediction.variance}` : '—';
  countEl.textContent = prediction.sortedDates.length;
}

function formatDisplayDate(isoDate) {
  const d = parseDate(isoDate);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

document.getElementById('log-today-btn').addEventListener('click', async () => {
  const today = formatDate(new Date());
  await handleAddDate(today);
});

// ---------- Calendar view ----------

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const prediction = buildPrediction(dates, PERIOD_LENGTH_DAYS);
  const days = buildCalendarMonth(year, month, prediction, PERIOD_LENGTH_DAYS);

  document.getElementById('cal-month-label').textContent = calendarCursor.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  const firstWeekday = new Date(year, month, 1).getDay();
  for (let i = 0; i < firstWeekday; i++) {
    grid.appendChild(document.createElement('div'));
  }

  for (const day of days) {
    const cell = document.createElement('div');
    cell.className = `cal-day${day.type ? ' ' + day.type : ''}`;
    cell.textContent = day.day;
    grid.appendChild(cell);
  }
}

document.getElementById('cal-prev').addEventListener('click', () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
  renderCalendar();
});

document.getElementById('cal-next').addEventListener('click', () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
  renderCalendar();
});

// ---------- History view ----------

function renderHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '';

  if (dates.length === 0) {
    const li = document.createElement('li');
    li.className = 'history-empty';
    li.textContent = 'No dates logged yet';
    list.appendChild(li);
    return;
  }

  const sorted = [...dates].sort().reverse();
  for (const date of sorted) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = formatDisplayDate(date);
    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = '✕';
    delBtn.setAttribute('aria-label', `Remove ${date}`);
    delBtn.addEventListener('click', () => handleDeleteDate(date));
    li.appendChild(label);
    li.appendChild(delBtn);
    list.appendChild(li);
  }
}

document.getElementById('add-date-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('add-date-input');
  if (!input.value) return;
  await handleAddDate(input.value);
  input.value = '';
});

async function handleAddDate(date) {
  if (dates.includes(date)) return;
  const previous = dates;
  dates = [...dates, date]; // optimistic update
  renderToday();
  renderCalendar();
  renderHistory();
  try {
    await addDate(date);
  } catch (err) {
    console.error('Failed to save date', err);
    dates = previous; // roll back
    renderToday();
    renderCalendar();
    renderHistory();
    alert("Couldn't save that date — check your connection and try again.");
  }
}

async function handleDeleteDate(date) {
  const previous = dates;
  dates = dates.filter((d) => d !== date);
  renderToday();
  renderCalendar();
  renderHistory();
  try {
    await deleteDate(date);
  } catch (err) {
    console.error('Failed to delete date', err);
    dates = previous;
    renderToday();
    renderCalendar();
    renderHistory();
    alert("Couldn't remove that date — check your connection and try again.");
  }
}

// ---------- Tab navigation ----------

const views = {
  today: document.getElementById('view-today'),
  calendar: document.getElementById('view-calendar'),
  history: document.getElementById('view-history'),
};

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    Object.entries(views).forEach(([name, el]) => {
      el.hidden = name !== btn.dataset.view;
    });
  });
});
