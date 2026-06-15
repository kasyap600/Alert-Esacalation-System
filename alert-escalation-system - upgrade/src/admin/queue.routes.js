const express = require('express');
const redis = require('../ingestion/redis');
const logger = require('../utils/logger');

const router = express.Router();

const TELEMETRY_PERSIST_STREAM = 'stream:telemetry:persist';
const TELEMETRY_PERSIST_GROUP = 'telemetry-persist-workers';
const TELEMETRY_DLQ_STREAM = 'stream:telemetry:dlq';
const NOTIFICATION_DLQ_STREAM = 'stream:notification:dlq';

async function getGroups(stream) {
  try {
    return await redis.call('XINFO', 'GROUPS', stream);
  } catch (error) {
    if (String(error.message).includes('no such key')) {
      return [];
    }
    throw error;
  }
}

async function getPendingSummary(stream, group) {
  try {
    const summary = await redis.call('XPENDING', stream, group);
    if (!Array.isArray(summary) || summary.length < 4) {
      return { count: 0, lowestId: null, highestId: null, consumers: [] };
    }
    return {
      count: Number(summary[0] || 0),
      lowestId: summary[1] || null,
      highestId: summary[2] || null,
      consumers: (summary[3] || []).map((entry) => ({
        consumer: entry[0],
        pending: Number(entry[1] || 0)
      }))
    };
  } catch (error) {
    if (String(error.message).includes('NOGROUP')) {
      return { count: 0, lowestId: null, highestId: null, consumers: [] };
    }
    throw error;
  }
}

router.get('/queue-health', async (_req, res) => {
  try {
    const [streamLength, dlqLength, notifDlqLength, groups] = await Promise.all([
      redis.xlen(TELEMETRY_PERSIST_STREAM).catch(() => 0),
      redis.xlen(TELEMETRY_DLQ_STREAM).catch(() => 0),
      redis.xlen(NOTIFICATION_DLQ_STREAM).catch(() => 0),
      getGroups(TELEMETRY_PERSIST_STREAM)
    ]);
    const pending = await getPendingSummary(TELEMETRY_PERSIST_STREAM, TELEMETRY_PERSIST_GROUP);

    return res.status(200).json({
      stream: TELEMETRY_PERSIST_STREAM,
      group: TELEMETRY_PERSIST_GROUP,
      streamLength: Number(streamLength || 0),
      dlq: {
        stream: TELEMETRY_DLQ_STREAM,
        length: Number(dlqLength || 0)
      },
      notificationDlq: {
        stream: NOTIFICATION_DLQ_STREAM,
        length: Number(notifDlqLength || 0)
      },
      pending,
      groups,
      checkedAt: new Date().toISOString()
    });
  } catch (error) {
    logger.error('queue_health_failed', { error: error.message });
    return res.status(500).json({ error: 'Failed to read queue health' });
  }
});

module.exports = router;
