// API integration tests (Express + in-memory PostgreSQL via pg-mem).
// Run: npm test (from the server directory)
// These hit the real HTTP routes with supertest — no server port needed.

process.env.USE_MEMORY_DB = 'true';
process.env.JWT_SECRET = 'test-secret-for-sweety';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp, initSchema } = require('../src/app');

let app;
let token; // token for the main test user
let userId;

const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

test.before(async () => {
  const created = createApp();
  app = created.app;
  await initSchema();
});

async function register(email, password = 'secret123', name = 'Test User') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name, email, password });
  return res;
}

test('health check', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
});

test('register + login flow', async () => {
  const res = await register('siva@example.com');
  assert.equal(res.status, 201);
  assert.ok(res.body.token);
  assert.equal(res.body.user.email, 'siva@example.com');
  token = res.body.token;
  userId = res.body.user.id;

  // Duplicate email is rejected.
  const dup = await register('siva@example.com');
  assert.equal(dup.status, 400);
  assert.match(dup.body.error, /already exists/);

  // Short password is rejected.
  const short = await register('other@example.com', '123');
  assert.equal(short.status, 400);

  // Login works with the same credentials; wrong password fails.
  const login = await request(app)
    .post('/api/auth/login')
    .send({ email: 'siva@example.com', password: 'secret123' });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);

  const badLogin = await request(app)
    .post('/api/auth/login')
    .send({ email: 'siva@example.com', password: 'wrongpass' });
  assert.equal(badLogin.status, 401);
  assert.equal(badLogin.body.error, 'Invalid email or password.');
});

test('readings require a login', async () => {
  const res = await request(app).get('/api/readings');
  assert.equal(res.status, 401);
});

test('add readings + every validation error message', async () => {
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);

  // Happy path.
  const ok = await auth(request(app).post('/api/readings')).send({
    date: today, slot: 'Morning (fasting)', value: 118,
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.reading.value, 118);

  // Missing value.
  const missing = await auth(request(app).post('/api/readings')).send({
    date: today, slot: 'After breakfast', value: '',
  });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.error, 'Please enter a glucose value.');

  // Out of range.
  for (const value of [39, 601, 120.5]) {
    const res = await auth(request(app).post('/api/readings')).send({
      date: today, slot: 'After breakfast', value,
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Value must be between 40 and 600 mg/dl.');
  }

  // Future date.
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const future = await auth(request(app).post('/api/readings')).send({
    date: tomorrow, slot: 'After breakfast', value: 130,
  });
  assert.equal(future.status, 400);
  assert.equal(future.body.error, 'Date cannot be in the future.');

  // Duplicate slot on the same day.
  const dup = await auth(request(app).post('/api/readings')).send({
    date: today, slot: 'Morning (fasting)', value: 130,
  });
  assert.equal(dup.status, 400);
  assert.equal(dup.body.error, 'You already have an Morning (fasting) reading for this date.');

  // Fill the day (3 more slots), then the 5th reading hits the daily cap.
  for (const slot of ['After breakfast', 'After lunch', 'After dinner']) {
    const res = await auth(request(app).post('/api/readings')).send({
      date: today, slot, value: 150,
    });
    assert.equal(res.status, 201);
  }
  const fifth = await auth(request(app).post('/api/readings')).send({
    date: today, slot: 'After breakfast', value: 140,
  });
  assert.equal(fifth.status, 400);
  assert.equal(fifth.body.error, 'You can add only 4 readings per day.');
});

test('edit and delete a reading', async () => {
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  const created = await auth(request(app).post('/api/readings')).send({
    date: yesterday, slot: 'Morning (fasting)', value: 110,
  });
  assert.equal(created.status, 201);
  const id = created.body.reading.id;

  const edited = await auth(request(app).put(`/api/readings/${id}`)).send({
    date: yesterday, slot: 'Morning (fasting)', value: 125,
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.reading.value, 125);

  const deleted = await auth(request(app).delete(`/api/readings/${id}`));
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.deleted, true);

  // Deleting again gives 404.
  const gone = await auth(request(app).delete(`/api/readings/${id}`));
  assert.equal(gone.status, 404);
});

test('reports: daily stats are computed correctly', async () => {
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  // Yesterday currently has no readings (the one above was deleted).
  for (const [slot, value] of [['Morning (fasting)', 120], ['After breakfast', 180], ['After lunch', 150]]) {
    const res = await auth(request(app).post('/api/readings')).send({
      date: yesterday, slot, value,
    });
    assert.equal(res.status, 201);
  }
  const res = await auth(request(app).get('/api/reports'))
    .query({ type: 'daily', date: yesterday });
  assert.equal(res.status, 200);
  assert.equal(res.body.count, 3);
  assert.equal(res.body.highest, 180);
  assert.equal(res.body.lowest, 120);
  assert.equal(res.body.average, 150);
  assert.equal(res.body.readings.length, 3);
  assert.equal(res.body.readings[0].slot, 'Morning (fasting)');

  // A date with no readings returns the friendly empty state (count 0, nulls).
  const empty = await auth(request(app).get('/api/reports'))
    .query({ type: 'daily', date: '2020-01-01' });
  assert.equal(empty.status, 200);
  assert.equal(empty.body.count, 0);
  assert.equal(empty.body.highest, null);
  assert.equal(empty.body.average, null);
});

test('reports: month-to-date and monthly ranges', async () => {
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  // Month-to-date for today covers today + yesterday's readings (4 + 3 = 7).
  const mtd = await auth(request(app).get('/api/reports'))
    .query({ type: 'month-to-date', date: today });
  assert.equal(mtd.status, 200);
  assert.equal(mtd.body.count, 7);

  // Monthly for today covers the whole previous month — no readings there yet.
  const monthly = await auth(request(app).get('/api/reports'))
    .query({ type: 'monthly', date: today });
  assert.equal(monthly.status, 200);
  assert.equal(monthly.body.count, 0);
});

test('pagination on GET /readings', async () => {
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  // Add readings on 7 different days (4 per day max) to get past 20 total.
  const slots = ['Morning (fasting)', 'After breakfast', 'After lunch', 'After dinner'];
  let added = 0;
  for (let dayOffset = 2; dayOffset <= 8; dayOffset += 1) {
    const d = new Date(Date.now() - dayOffset * 86400000).toISOString().slice(0, 10);
    for (const slot of slots) {
      const res = await auth(request(app).post('/api/readings')).send({ date: d, slot, value: 120 + added });
      if (res.status === 201) added += 1;
    }
  }
  assert.ok(added >= 20, `expected at least 20 added, got ${added}`);

  const page1 = await auth(request(app).get('/api/readings')).query({ page: 1, limit: 20 });
  assert.equal(page1.status, 200);
  assert.equal(page1.body.readings.length, 20);
  assert.equal(page1.body.total, 7 + added); // 7 earlier + newly added
  assert.equal(page1.body.totalPages, 2);

  const page2 = await auth(request(app).get('/api/readings')).query({ page: 2, limit: 20 });
  assert.equal(page2.body.readings.length, page2.body.total - 20);
});

test('users only see their own readings', async () => {
  const other = await register('other-user@example.com');
  assert.equal(other.status, 201);
  const otherToken = other.body.token;

  const mine = await request(app).get('/api/readings')
    .set('Authorization', `Bearer ${token}`);
  const theirs = await request(app).get('/api/readings')
    .set('Authorization', `Bearer ${otherToken}`);
  assert.ok(mine.body.total > 0);
  assert.equal(theirs.body.total, 0);

  // The other user cannot delete my reading.
  const myReadingId = mine.body.readings[0].id;
  const attempt = await request(app).delete(`/api/readings/${myReadingId}`)
    .set('Authorization', `Bearer ${otherToken}`);
  assert.equal(attempt.status, 404);
});
