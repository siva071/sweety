// Unit tests for the validation rules and report maths.
// Run: npm test (from the server directory)

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SLOTS,
  validateReading,
  computeStats,
  reportRange,
} = require('../src/validation');

test('slots are the four required slots', () => {
  assert.deepEqual(SLOTS, [
    'Morning (fasting)',
    'After breakfast',
    'After lunch',
    'After dinner',
  ]);
});

test('validateReading: missing value', () => {
  assert.equal(
    validateReading({ date: '2026-11-15', slot: 'Morning (fasting)', value: '' }),
    'Please enter a glucose value.',
  );
  assert.equal(
    validateReading({ date: '2026-11-15', slot: 'Morning (fasting)' }),
    'Please enter a glucose value.',
  );
});

test('validateReading: value out of range or not a whole number', () => {
  const bad = [39, 601, 0, -5, 120.5, 'abc'];
  for (const value of bad) {
    assert.equal(
      validateReading({ date: '2026-11-15', slot: 'Morning (fasting)', value }),
      'Value must be between 40 and 600 mg/dl.',
    );
  }
  // Boundaries are allowed.
  assert.equal(validateReading({ date: '2026-11-15', slot: 'Morning (fasting)', value: 40 }), null);
  assert.equal(validateReading({ date: '2026-11-15', slot: 'Morning (fasting)', value: 600 }), null);
});

test('validateReading: future date is rejected', () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const s = tomorrow.toISOString().slice(0, 10);
  assert.equal(
    validateReading({ date: s, slot: 'Morning (fasting)', value: 120 }),
    'Date cannot be in the future.',
  );
});

test('validateReading: duplicate slot on the same day', () => {
  assert.equal(
    validateReading(
      { date: '2026-11-15', slot: 'After lunch', value: 150 },
      { existingSlots: ['After lunch'], existingCount: 1 },
    ),
    'You already have an After lunch reading for this date.',
  );
});

test('validateReading: fifth reading on a full day hits the cap', () => {
  assert.equal(
    validateReading(
      { date: '2026-11-15', slot: 'After lunch', value: 150 },
      { existingSlots: ['Morning (fasting)', 'After breakfast', 'After lunch', 'After dinner'], existingCount: 4 },
    ),
    'You can add only 4 readings per day.',
  );
});

test('validateReading: a valid reading passes', () => {
  assert.equal(
    validateReading({ date: '2026-11-15', slot: 'After dinner', value: 140 }),
    null,
  );
});

test('computeStats: highest, lowest, average (1 decimal), count', () => {
  assert.deepEqual(
    computeStats([{ value: 120 }, { value: 180 }, { value: 150 }]),
    { count: 3, highest: 180, lowest: 120, average: 150 },
  );
  // Average rounds to 1 decimal: (100 + 101) / 2 = 100.5
  assert.deepEqual(
    computeStats([{ value: 100 }, { value: 101 }]),
    { count: 2, highest: 101, lowest: 100, average: 100.5 },
  );
  // (100 + 101 + 102) / 3 = 101 exactly
  assert.deepEqual(
    computeStats([{ value: 100 }, { value: 101 }, { value: 102 }]),
    { count: 3, highest: 102, lowest: 100, average: 101 },
  );
});

test('computeStats: no readings gives nulls', () => {
  assert.deepEqual(
    computeStats([]),
    { count: 0, highest: null, lowest: null, average: null },
  );
});

test('reportRange: daily, month-to-date, monthly (previous month)', () => {
  assert.deepEqual(reportRange('daily', '2026-10-15'), {
    start: '2026-10-15', end: '2026-10-15', label: '2026-10-15',
  });
  assert.deepEqual(reportRange('month-to-date', '2026-10-15'), {
    start: '2026-10-01', end: '2026-10-15', label: '2026-10-01 to 2026-10-15',
  });
  // Monthly = the whole previous month (example from the assignment).
  assert.deepEqual(reportRange('monthly', '2026-10-15'), {
    start: '2026-09-01', end: '2026-09-30', label: '2026-09-01 to 2026-09-30',
  });
  // January wraps to December of the previous year.
  assert.deepEqual(reportRange('monthly', '2026-01-20'), {
    start: '2025-12-01', end: '2025-12-31', label: '2025-12-01 to 2025-12-31',
  });
});
