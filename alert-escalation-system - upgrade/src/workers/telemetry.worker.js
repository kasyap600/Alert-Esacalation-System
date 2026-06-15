require('dotenv').config();
const { validateDatabaseCredentials } = require('../config/env');
const logger = require('../utils/logger');

try {
  validateDatabaseCredentials();
} catch (e) {
  logger.error('env_validation_failed', { error: e.message });
  process.exit(1);
}

const sequelize = require('../db');
require('../ingestion/redis');
const telemetryWorker = require('../ingestion/telemetry.worker');

async function start() {
  await sequelize.authenticate();
  await telemetryWorker();
}

start().catch((err) => {
  logger.error('telemetry_worker_start_failed', { error: err.message });
  process.exit(1);
});
