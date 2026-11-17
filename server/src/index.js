// Server entry point: create schema, then listen.
require('dotenv').config();
const { createApp, initSchema } = require('./app');

const PORT = process.env.PORT || 5000;

(async () => {
  const { app, pool } = createApp();
  await initSchema();
  // eslint-disable-next-line no-console
  console.log('Database ready.');
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Sweety API listening on http://localhost:${PORT}`);
    // eslint-disable-next-line no-console
    console.log(`Database mode: ${process.env.USE_MEMORY_DB === 'true' ? 'in-memory (demo)' : 'PostgreSQL'}`);
  });
  process.on('SIGINT', async () => {
    await pool.end();
    process.exit(0);
  });
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
