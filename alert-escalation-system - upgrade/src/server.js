require('dotenv').config();
const { validateApiServerEnv } = require('./config/env');
const logger = require('./utils/logger');

try {
  validateApiServerEnv();
} catch (e) {
  logger.error('env_validation_failed', { error: e.message });
  process.exit(1);
}

const sequelize = require('./db');
require('./ingestion/redis');
const { createApp } = require('./app');

async function start() {
  await sequelize.authenticate();
  const app = createApp();
  const port = Number(process.env.PORT || 5000);
  app.listen(port, () => {
    logger.info('api_started', { port });
  });
}

start().catch((err) => {
  const msg = err.message || String(err);
  const hint =
    /password must be a string/i.test(msg) || /SCRAM/i.test(msg)
      ? 'Set DB_PASSWORD in .env to your PostgreSQL user password (non-empty). Also supported: POSTGRES_PASSWORD, PGPASSWORD. Empty or missing values become null and SCRAM auth fails.'
      : undefined;
  logger.error('api_start_failed', { error: msg, ...(hint && { hint }) });
  process.exit(1);
});
