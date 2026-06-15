require('dotenv').config();
const { validateDatabaseCredentials } = require('../config/env');
const logger = require('../utils/logger');

try {
  validateDatabaseCredentials();
} catch (e) {
  logger.error('env_validation_failed', { error: e.message });
  process.exit(1);
}

require('../ingestion/redis');
const sequelize = require('../db');
const { startEscalationScheduler } = require('../scheduler/escalation.scheduler');

async function start() {
  await sequelize.authenticate();
  startEscalationScheduler();
  logger.info('escalation_worker_started');
}

start().catch((err) => {
  logger.error('escalation_worker_failed', { error: err.message });
  process.exit(1);
});
