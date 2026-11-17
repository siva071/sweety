// Shared validation rules for glucose readings.
// The error strings below are the exact messages the assignment requires
// the UI to show — do not reword them.

const SLOTS = [
  'Morning (fasting)',
  'After breakfast',
  'After lunch',
  'After dinner',
];

// Today's date as YYYY-MM-DD in the server's local timezone.
function todayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isValidDateString(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  // Validate via UTC components: parsing 'YYYY-MM-DDT00:00:00' as local time
  // and comparing with toISOString() breaks in timezones ahead of UTC
  // (e.g. IST: midnight local is the previous day in UTC), so a valid date
  // like 2026-11-15 was wrongly rejected.
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Validate a reading before insert/update.
 * @param {Object} input { date, slot, value }
 * @param {Object} ctx { existingSlots: string[] (other readings that day, excluding the one being edited), existingCount: number }
 * @returns {string|null} an error message, or null when valid.
 * Check order matters: required -> range -> date -> daily cap -> duplicate slot.
 * (The cap is checked before the duplicate so that a 5th reading on a full
 * day reports "You can add only 4 readings per day." — with only 4 slots,
 * a duplicate check first would make the cap message unreachable.)
 */
function validateReading(input, ctx = {}) {
  const { existingSlots = [], existingCount = 0 } = ctx;
  const { date, slot, value } = input;

  // 1. Value is required.
  if (value === undefined || value === null || value === '') {
    return 'Please enter a glucose value.';
  }
  // 2. Whole number between 40 and 600 mg/dl.
  const num = Number(value);
  if (!Number.isInteger(num) || num < 40 || num > 600) {
    return 'Value must be between 40 and 600 mg/dl.';
  }
  // 3. A valid date is required.
  if (!date) {
    return 'Please choose a date.';
  }
  if (!isValidDateString(date)) {
    return 'Please choose a valid date.';
  }
  // 4. Date cannot be in the future.
  if (date > todayString()) {
    return 'Date cannot be in the future.';
  }
  // 5. Slot must be one of the four.
  if (!SLOTS.includes(slot)) {
    return 'Please choose a time slot.';
  }
  // 6. Maximum 4 readings per day (checked before the duplicate rule so
  //    the cap message is reachable — see the note above).
  if (existingCount >= 4) {
    return 'You can add only 4 readings per day.';
  }
  // 7. Only one reading per slot per day.
  if (existingSlots.includes(slot)) {
    return `You already have an ${slot} reading for this date.`;
  }
  return null;
}

/**
 * Report statistics for a list of readings.
 * Average is rounded to 1 decimal place, as the assignment requires.
 * Returns nulls when there are no readings (the UI shows an empty state).
 */
function computeStats(readings) {
  if (!readings || readings.length === 0) {
    return { count: 0, highest: null, lowest: null, average: null };
  }
  const values = readings.map((r) => Number(r.value));
  const highest = Math.max(...values);
  const lowest = Math.min(...values);
  const average = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  return { count: values.length, highest, lowest, average };
}

/** Date ranges for the three report types, given a selected date (YYYY-MM-DD). */
function reportRange(type, selectedDate) {
  const [y, m, d] = selectedDate.split('-').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (yy, mm, dd) => `${yy}-${pad(mm)}-${pad(dd)}`;

  if (type === 'daily') {
    return { start: selectedDate, end: selectedDate, label: selectedDate };
  }
  if (type === 'month-to-date') {
    return { start: fmt(y, m, 1), end: selectedDate, label: `${fmt(y, m, 1)} to ${selectedDate}` };
  }
  // monthly: the whole previous month relative to the selected date
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const lastDay = new Date(prevYear, prevMonth, 0).getDate(); // day 0 of next month
  return { start: fmt(prevYear, prevMonth, 1), end: fmt(prevYear, prevMonth, lastDay), label: `${fmt(prevYear, prevMonth, 1)} to ${fmt(prevYear, prevMonth, lastDay)}` };
}

module.exports = { SLOTS, todayString, isValidDateString, validateReading, computeStats, reportRange };
