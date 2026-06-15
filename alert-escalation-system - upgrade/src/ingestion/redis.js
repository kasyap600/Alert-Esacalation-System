const Redis = require('ioredis');
const logger = require('../utils/logger');

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: true
});

redis.on('connect', () => {
  logger.info('redis_connected', { host: process.env.REDIS_HOST || '127.0.0.1' });
});

redis.on('error', (err) => {
  logger.error('redis_connection_error', { error: err.message });
});

module.exports = redis;