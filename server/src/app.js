// Sweety API — Express app factory.
// Exported as a factory so tests can create an app against an in-memory
// database without starting an HTTP server.

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const { createPool, initSchema } = require('./db');
const { signToken, authRequired } = require('./auth');
const { SLOTS, validateReading, computeStats, reportRange } = require('./validation');

// Order the four slots chronologically in lists.
const SLOT_ORDER_SQL = `CASE slot
  WHEN 'Morning (fasting)' THEN 1
  WHEN 'After breakfast' THEN 2
  WHEN 'After lunch' THEN 3
  WHEN 'After dinner' THEN 4
  ELSE 5 END`;

// The pg driver returns DATE columns as JS Date objects (midnight UTC);
// pg-mem returns them the same way. Normalise to a YYYY-MM-DD string so
// the API always returns the same shape in both modes.
function fmtDate(d) {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}
function normaliseReadings(rows) {
  return rows.map((r) => ({ ...r, date: fmtDate(r.date) }));
}

function createApp() {
  const pool = createPool();
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
  app.get('/api/slots', (req, res) => res.json({ slots: SLOTS }));

  // ---- Auth -------------------------------------------------------------
  app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Please enter your name.' });
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    try {
      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [String(email).toLowerCase()]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'An account with this email already exists.' });
      }
      const passwordHash = await bcrypt.hash(String(password), 10);
      const result = await pool.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
        [String(name).trim(), String(email).toLowerCase(), passwordHash],
      );
      const user = result.rows[0];
      return res.status(201).json({ token: signToken(user), user });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Please enter your email and password.' });
    try {
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [String(email).toLowerCase()]);
      const user = result.rows[0];
      if (!user) return res.status(401).json({ error: 'Invalid email or password.' });
      const ok = await bcrypt.compare(String(password), user.password_hash);
      if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });
      return res.json({
        token: signToken(user),
        user: { id: user.id, name: user.name, email: user.email },
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // ---- Readings ---------------------------------------------------------
  // List the logged-in user's readings, newest first.
  // Bonus: pagination via ?page=1&limit=20 (defaults page 1, limit 20).
  app.get('/api/readings', authRequired, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    try {
      const totalResult = await pool.query('SELECT COUNT(*)::int AS total FROM readings WHERE user_id = $1', [req.user.id]);
      const total = totalResult.rows[0].total;
      const result = await pool.query(
        `SELECT id, date, slot, value FROM readings
         WHERE user_id = $1 ORDER BY date DESC, ${SLOT_ORDER_SQL} LIMIT $2 OFFSET $3`,
        [req.user.id, limit, offset],
      );
      return res.json({
        readings: normaliseReadings(result.rows),
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // Add a reading (server-side validation with the exact required messages).
  app.post('/api/readings', authRequired, async (req, res) => {
    const { date, slot, value } = req.body || {};
    try {
      const day = await pool.query(
        'SELECT slot FROM readings WHERE user_id = $1 AND date = $2',
        [req.user.id, date],
      );
      const error = validateReading(
        { date, slot, value },
        { existingSlots: day.rows.map((r) => r.slot), existingCount: day.rows.length },
      );
      if (error) return res.status(400).json({ error });
      const result = await pool.query(
        `INSERT INTO readings (user_id, date, slot, value) VALUES ($1, $2, $3, $4)
         RETURNING id, date, slot, value`,
        [req.user.id, date, slot, Number(value)],
      );
      return res.status(201).json({ reading: normaliseReadings(result.rows)[0] });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // Edit a reading (the reading being edited does not count against itself).
  app.put('/api/readings/:id', authRequired, async (req, res) => {
    const { date, slot, value } = req.body || {};
    try {
      const current = await pool.query(
        'SELECT id, date, slot FROM readings WHERE id = $1 AND user_id = $2',
        [req.params.id, req.user.id],
      );
      if (current.rows.length === 0) return res.status(404).json({ error: 'Reading not found.' });
      const day = await pool.query(
        'SELECT slot FROM readings WHERE user_id = $1 AND date = $2 AND id <> $3',
        [req.user.id, date, req.params.id],
      );
      const error = validateReading(
        { date, slot, value },
        { existingSlots: day.rows.map((r) => r.slot), existingCount: day.rows.length },
      );
      if (error) return res.status(400).json({ error });
      const result = await pool.query(
        `UPDATE readings SET date = $1, slot = $2, value = $3, updated_at = NOW()
         WHERE id = $4 AND user_id = $5 RETURNING id, date, slot, value`,
        [date, slot, Number(value), req.params.id, req.user.id],
      );
      return res.json({ reading: normaliseReadings(result.rows)[0] });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  app.delete('/api/readings/:id', authRequired, async (req, res) => {
    try {
      const result = await pool.query(
        'DELETE FROM readings WHERE id = $1 AND user_id = $2 RETURNING id',
        [req.params.id, req.user.id],
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Reading not found.' });
      return res.json({ deleted: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  // ---- Reports ----------------------------------------------------------
  // GET /api/reports?type=daily|month-to-date|monthly&date=YYYY-MM-DD
  app.get('/api/reports', authRequired, async (req, res) => {
    const type = req.query.type || 'daily';
    const date = req.query.date;
    if (!['daily', 'month-to-date', 'monthly'].includes(type)) {
      return res.status(400).json({ error: 'Unknown report type.' });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Please choose a date.' });
    }
    try {
      const range = reportRange(type, date);
      const result = await pool.query(
        `SELECT id, date, slot, value FROM readings
         WHERE user_id = $1 AND date >= $2 AND date <= $3
         ORDER BY date ASC, ${SLOT_ORDER_SQL}`,
        [req.user.id, range.start, range.end],
      );
      const stats = computeStats(result.rows);
      return res.json({
        type,
        date,
        range: { start: range.start, end: range.end, label: range.label },
        ...stats,
        readings: type === 'daily' ? normaliseReadings(result.rows) : undefined,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      return res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

  return { app, pool };
}

module.exports = { createApp, initSchema };
