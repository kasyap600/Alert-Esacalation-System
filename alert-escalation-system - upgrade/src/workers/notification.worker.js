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
const { startNotificationListener } = require('../notifications/notification.service');

async function start() {
  await sequelize.authenticate();
  await startNotificationListener();
  logger.info('notification_worker_started');
}

start().catch((err) => {
  logger.error('notification_worker_start_failed', { error: err.message });
  process.exit(1);
});
