const redis = require('./redis');
const { storeTelemetry } = require('./telemetry.service');
const logger = require('../utils/logger');

const TELEMETRY_PERSIST_STREAM = 'stream:telemetry:persist';
const TELEMETRY_PERSIST_GROUP = 'telemetry-persist-workers';
const DEAD_LETTER_STREAM = 'stream:telemetry:dlq';
const CLAIM_IDLE_MS = 60000;
const CLAIM_BATCH_COUNT = 20;

function parseFields(fields = []) {
  const parsed = {};
  for (let i = 0; i < fields.length; i += 2) {
    parsed[fields[i]] = fields[i + 1];
  }
  return parsed;
}

async function ensureConsumerGroup(streamKey, groupName) {
  try {
    await redis.xgroup('CREATE', streamKey, groupName, '0', 'MKSTREAM');
    logger.info('telemetry_stream_group_created', { streamKey, groupName });
  } catch (error) {
    if (!String(error.message).includes('BUSYGROUP')) {
      throw error;
    }
  }
}

function parseAutoClaimResult(result) {
  if (!result || !Array.isArray(result)) {
    return { nextStartId: '0-0', entries: [] };
  }
  if (result.length === 2) {
    const [nextStartId, entries] = result;
    return { nextStartId, entries: entries || [] };
  }
  if (result.length >= 3) {
    const [nextStartId, entries] = result;
    return { nextStartId, entries: entries || [] };
  }
  return { nextStartId: '0-0', entries: [] };
}

async function processEntry(id, fields) {
  const payload = parseFields(fields);
  try {
    const packet = {
      deviceId: payload.deviceId,
      timestamp: Number(payload.timestamp),
      metrics: JSON.parse(payload.metrics || '{}')
    };
    await storeTelemetry(packet);
    await redis.xack(TELEMETRY_PERSIST_STREAM, TELEMETRY_PERSIST_GROUP, id);
  } catch (processingError) {
    await redis.xadd(
      DEAD_LETTER_STREAM,
      '*',
      'sourceStream',
      TELEMETRY_PERSIST_STREAM,
      'entryId',
      id,
      'error',
      processingError.message,
      'payload',
      JSON.stringify(payload),
      'failedAt',
      new Date().toISOString()
    );
    await redis.xack(TELEMETRY_PERSIST_STREAM, TELEMETRY_PERSIST_GROUP, id);
    logger.error('telemetry_event_failed', { entryId: id, error: processingError.message });
  }
}

async function reclaimIdleMessages(consumerName) {
  let cursor = '0-0';
  while (true) {
    const rawResult = await redis.xautoclaim(
      TELEMETRY_PERSIST_STREAM,
      TELEMETRY_PERSIST_GROUP,
      consumerName,
      CLAIM_IDLE_MS,
      cursor,
      'COUNT',
      CLAIM_BATCH_COUNT
    );
    const { nextStartId, entries } = parseAutoClaimResult(rawResult);
    if (!entries.length) {
      break;
    }
    logger.warn('telemetry_messages_reclaimed', { count: entries.length, consumer: consumerName });
    for (const [id, fields] of entries) {
      await processEntry(id, fields);
    }
    if (!nextStartId || nextStartId === cursor || nextStartId === '0-0') {
      break;
    }
    cursor = nextStartId;
  }
}

async function telemetryWorker() {
  await ensureConsumerGroup(TELEMETRY_PERSIST_STREAM, TELEMETRY_PERSIST_GROUP);
  const consumerName = `consumer-${process.pid}`;
  logger.info('telemetry_worker_started', {
    stream: TELEMETRY_PERSIST_STREAM,
    group: TELEMETRY_PERSIST_GROUP,
    consumer: consumerName
  });

  while (true) {
    try {
      await reclaimIdleMessages(consumerName);
      const streams = await redis.xreadgroup(
        'GROUP',
        TELEMETRY_PERSIST_GROUP,
        consumerName,
        'COUNT',
        10,
        'BLOCK',
        5000,
        'STREAMS',
        TELEMETRY_PERSIST_STREAM,
        '>'
      );
      if (!streams) {
        continue;
      }
      for (const [, entries] of streams) {
        for (const [id, fields] of entries) {
          await processEntry(id, fields);
        }
      }
    } catch (err) {
      logger.error('telemetry_worker_error', { error: err.message });
    }
  }
}

module.exports = telemetryWorker;