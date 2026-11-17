// Database layer.
// Production/dev mode: real PostgreSQL via the `pg` driver (DATABASE_URL).
// Demo mode: USE_MEMORY_DB=true runs the same SQL against an in-memory
// PostgreSQL emulator (pg-mem), so the app can be demoed on a machine
// without PostgreSQL installed. The SQL is identical in both modes.

let pool = null;

function createPool() {
  if (pool) return pool;

  if (process.env.USE_MEMORY_DB === 'true') {
    // eslint-disable-next-line global-require
    const { newDb } = require('pg-mem');
    const db = newDb();
    const pg = db.adapters.createPg();
    pool = new pg.Pool();
    return pool;
  }

  // eslint-disable-next-line global-require
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS readings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  slot TEXT NOT NULL,
  value INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date, slot)
);
`;

async function initSchema() {
  const p = createPool();
  await p.query(SCHEMA);
  return p;
}

module.exports = { createPool, initSchema };
