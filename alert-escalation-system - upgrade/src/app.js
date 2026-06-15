require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getCorsOptions, getJsonBodyLimit } = require('./config/env');
const { requireApiKey, requireIngestKey } = require('./middleware/auth');
const metrics = require('./observability/metrics');
const logger = require('./utils/logger');

function createApp() {
  const app = express();
  if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
  }

  app.use(cors(getCorsOptions()));
  app.use(express.json({ limit: getJsonBodyLimit() }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/ready', async (_req, res) => {
    try {
      const sequelize = require('./db');
      const redis = require('./ingestion/redis');
      await sequelize.authenticate();
      const pong = await redis.ping();
      if (pong !== 'PONG') {
        throw new Error('Redis ping unexpected response');
      }
      res.status(200).json({
        status: 'ready',
        checks: { database: true, redis: true }
      });
    } catch (err) {
      logger.error('ready_check_failed', { error: err.message });
      res.status(503).json({
        status: 'not_ready',
        error: 'dependency_unavailable'
      });
    }
  });

  const metricsHandler = (_req, res) => {
    res.status(200).json(metrics.snapshot());
  };
  if (process.env.METRICS_REQUIRE_AUTH === 'true') {
    app.get('/metrics', requireApiKey, metricsHandler);
  } else {
    app.get('/metrics', metricsHandler);
  }

  const ingestionRoutes = require('./ingestion/ingestion.routes');
  app.use('/api', requireIngestKey, ingestionRoutes);

  const adminDeviceRoutes = require('./admin/device.routes');
  const adminRuleRoutes = require('./admin/rule.routes');
  const adminEscalationRoutes = require('./admin/escalation.routes');
  const adminQueueRoutes = require('./admin/queue.routes');
  app.use('/api/admin', requireApiKey, adminDeviceRoutes);
  app.use('/api/admin', requireApiKey, adminRuleRoutes);
  app.use('/api/admin', requireApiKey, adminEscalationRoutes);
  app.use('/api/admin', requireApiKey, adminQueueRoutes);

  const rulesController = require('./rules/rules.controller');
  app.use('/api/rules', requireApiKey, rulesController);

  const deviceRoutes = require('./devices/device.routes');
  app.use('/api/devices', requireApiKey, deviceRoutes);

  app.use('/api/alerts', requireApiKey, require('./alerts/alert.routes'));

  app.use((err, _req, res, _next) => {
    logger.error('unhandled_http_error', { error: err.message });
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };