require('dotenv').config();
const fs = require('fs/promises');
const path = require('path');
const { validateDatabaseCredentials } = require('../config/env');
const logger = require('../utils/logger');

try {
  validateDatabaseCredentials();
} catch (e) {
  logger.error('env_validation_failed', { error: e.message });
  process.exit(1);
}

const sequelize = require('../db');

async function run() {
  const migrationsDir = path.resolve(__dirname, '../../migrations');
  const names = (await fs.readdir(migrationsDir))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (names.length === 0) {
    logger.warn('migrations_none_found', { dir: migrationsDir });
    return;
  }
  await sequelize.authenticate();
  for (const file of names) {
    const sqlPath = path.join(migrationsDir, file);
    const sql = await fs.readFile(sqlPath, 'utf8');
    await sequelize.query(sql);
    logger.info('migration_completed', { script: file });
  }
  logger.info('migrations_all_completed', { count: names.length });
}

run().catch((err) => {
  logger.error('migration_failed', { error: err.message });
  process.exit(1);
});
