require('dotenv').config();
const redis = require('../ingestion/redis');
const rulesService = require('../rules/rules.service');
const logger = require('../utils/logger');
const metrics = require('../observability/metrics');

const STREAM = 'stream:telemetry:ingest';
const GROUP = 'rule-eval-workers';
const CONSUMER = process.env.RULE_WORKER_NAME || `rule-worker-${process.pid}`;

async function ensureGroup() {
  try {
    await redis.xgroup('CREATE', STREAM, GROUP, '$', 'MKSTREAM');
  } catch (err) {
    if (!String(err.message).includes('BUSYGROUP')) throw err;
  }
}

function parseEntry(entry) {
  const [, fields] = entry;
  const obj = {};
  for (let i = 0; i < fields.length; i += 2) {
    obj[fields[i]] = fields[i + 1];
  }
  let metrics = {};
  try {
    metrics = JSON.parse(obj.metrics || '{}');
  } catch (e) {
    throw new Error(`Invalid metrics JSON: ${e.message}`);
  }
  const ts = Number(obj.timestamp);
  if (!Number.isFinite(ts)) {
    throw new Error('Invalid timestamp on stream entry');
  }
  if (!obj.deviceId || typeof obj.deviceId !== 'string') {
    throw new Error('Missing or invalid deviceId on stream entry');
  }
  return {
    packetId: obj.packetId,
    deviceId: obj.deviceId,
    timestamp: ts,
    metrics
  };
}

async function run() {
  await ensureGroup();
  logger.info('rule_worker_started', { consumer: CONSUMER });
  while (true) {
    try {
      const data = await redis.xreadgroup(
        'GROUP', GROUP, CONSUMER,
        'COUNT', 50,
        'BLOCK', 5000,
        'STREAMS', STREAM, '>'
      );
      if (!data) continue;
      const [, entries] = data[0];
      for (const entry of entries) {
        const [entryId] = entry;
        const started = Date.now();
        try {
          const packet = parseEntry(entry);
          await rulesService.evaluate(packet);
          metrics.increment('ruleEval.success');
        } catch (err) {
          metrics.increment('ruleEval.failure');
          logger.error('rule_worker_entry_failed', { error: err.message, entryId });
        } finally {
          try {
            await redis.xack(STREAM, GROUP, entryId);
          } catch (ackErr) {
            logger.error('rule_worker_xack_failed', { error: ackErr.message, entryId });
          }
          metrics.observe('ruleEval.durationMs', Date.now() - started);
        }
      }
    } catch (err) {
      logger.error('rule_worker_loop_failed', { error: err.message });
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

run().catch((err) => {
  logger.error('rule_worker_start_failed', { error: err.message });
  process.exit(1);
});
