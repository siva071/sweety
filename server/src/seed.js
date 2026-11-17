// Seed script: creates a demo user with sample readings.
// Run:  npm run seed        (server)  — or:  node src/seed.js
// Demo login: demo@sweety.app / demo1234
//
// It seeds through the public API (not direct SQL), so it works the same
// against real PostgreSQL and against the in-memory demo database —
// and it exercises the same validation the UI uses.
// The API must be running first:  npm start  (default http://localhost:5000)
// Safe to run more than once: it clears the demo user's old readings first.
require('dotenv').config();

const API = process.env.API_URL || 'http://localhost:5000';
const DEMO_USER = { name: 'Demo User', email: 'demo@sweety.app', password: 'demo1234' };

// Sample readings spread over the last few days and last month,
// so every report (daily, month-to-date, monthly) has data to show.
// Dates are relative to today so the demo always looks alive.
function sampleReadings() {
  const day = (offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  const prevMonth = (offset) => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  };
  return [
    { date: day(0), slot: 'Morning (fasting)', value: 118 },
    { date: day(0), slot: 'After breakfast', value: 162 },
    { date: day(0), slot: 'After lunch', value: 148 },
    { date: day(-1), slot: 'Morning (fasting)', value: 121 },
    { date: day(-1), slot: 'After breakfast', value: 171 },
    { date: day(-1), slot: 'After dinner', value: 139 },
    { date: day(-2), slot: 'Morning (fasting)', value: 110 },
    { date: day(-2), slot: 'After lunch', value: 155 },
    { date: day(-3), slot: 'Morning (fasting)', value: 126 },
    { date: day(-3), slot: 'After dinner', value: 144 },
    { date: prevMonth(0), slot: 'Morning (fasting)', value: 115 },
    { date: prevMonth(0), slot: 'After breakfast', value: 158 },
    { date: prevMonth(-1), slot: 'Morning (fasting)', value: 122 },
    { date: prevMonth(-1), slot: 'After lunch', value: 149 },
  ];
}

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data.error || 'failed'}`);
  return data;
}

(async () => {
  // Register the demo user (or log in if it already exists).
  let token;
  try {
    const reg = await api('/api/auth/register', { method: 'POST', body: DEMO_USER });
    token = reg.token;
  } catch (e) {
    if (!String(e.message).includes('already exists')) throw e;
    const login = await api('/api/auth/login', { method: 'POST', body: { email: DEMO_USER.email, password: DEMO_USER.password } });
    token = login.token;
  }

  // Clear the demo user's old readings, then add the sample set.
  const existing = await api('/api/readings?limit=100', { token });
  for (const r of existing.readings) {
    await api(`/api/readings/${r.id}`, { method: 'DELETE', token });
  }
  const readings = sampleReadings();
  for (const r of readings) {
    await api('/api/readings', { method: 'POST', token, body: r });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded demo user ${DEMO_USER.email} with ${readings.length} readings.`);
  // eslint-disable-next-line no-console
  console.log('Demo login: demo@sweety.app / demo1234');
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Seed failed:', err.message);
  process.exit(1);
});
