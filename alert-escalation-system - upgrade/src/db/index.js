const { Sequelize } = require('sequelize');
const { resolveDbPassword } = require('../config/env');

const dbPassword = resolveDbPassword();

const sequelize = new Sequelize(
  process.env.DB_NAME || 'alert_escalation_db',
  process.env.DB_USER || 'postgres',
  dbPassword,
  {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    dialect: 'postgres',
    logging: process.env.DB_LOGGING === 'true',
    pool: {
      max: Number(process.env.DB_POOL_MAX || 30),
      min: Number(process.env.DB_POOL_MIN || 2),
      acquire: Number(process.env.DB_POOL_ACQUIRE_MS || 30000),
      idle: Number(process.env.DB_POOL_IDLE_MS || 10000)
    }
  }
);

module.exports = sequelize;
