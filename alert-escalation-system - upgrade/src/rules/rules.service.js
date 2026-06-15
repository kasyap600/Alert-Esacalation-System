const crypto = require('crypto');
const redis = require('../ingestion/redis');
const alertService = require('../alerts/alert.service');
const { Rule } = require('../db/models');
const logger = require('../utils/logger');
const TELEMETRY_PERSIST_STREAM = 'stream:telemetry:persist';

function getPacketDedupeTtlSeconds() {
  const raw = process.env.PACKET_DEDUPE_TTL_SECONDS;
  if (raw === undefined || raw === '') return 120;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 120;
  return Math.min(Math.floor(n), 86400 * 7);
}

function getMetricEvalConcurrency() {
  const raw = process.env.METRIC_EVAL_CONCURRENCY;
  if (raw === undefined || raw === '') return 8;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 8;
  return Math.min(Math.floor(n), 64);
}

async function runWithConcurrency(items, concurrency, fn) {
  if (!items.length) return;
  const limit = Math.min(concurrency, items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: limit }, () => worker()));
}

/**
 * Store raw telemetry packet in Redis Stream
 */
async function storeRawPacket(packet) {
  const { deviceId, metrics, timestamp } = packet;
  const streamKey = `telemetry:device:${deviceId}`;
  await redis.xadd(
    streamKey,
    '*',
    'deviceId',
    deviceId,
    'metrics',
    JSON.stringify(metrics),
    'timestamp',
    String(timestamp)
  );
}

function generatePacketId(packet) {
  return crypto
    .createHash('sha1')
    .update(
      packet.deviceId +
      JSON.stringify(packet.metrics) +
      packet.timestamp
    )
    .digest('hex');
}

async function isDuplicatePacket(packetId) {
  const key = `packet:${packetId}`;
  const ttlSec = getPacketDedupeTtlSeconds();

  const result = await redis.set(
    key,
    1,
    'NX',
    'EX',
    ttlSec
  );

  return result === null;
}

function normalizeRuleRecord(rule) {
  return {
    ruleId: rule.id,
    min: Number(rule.min_value),
    max: Number(rule.max_value),
    packet_threshold: Number(rule.packet_threshold || 1),
    duration_minutes: Number(rule.duration_minutes || 0),
    severity: rule.severity || 'HIGH'
  };
}

async function cacheRule(rule) {
  if (!rule.enabled) {
    await redis.hdel(`rules:${rule.device_id}`, rule.metric_name);
    return;
  }
  await redis.hset(
    `rules:${rule.device_id}`,
    rule.metric_name,
    JSON.stringify(normalizeRuleRecord(rule))
  );
}

async function loadDeviceRulesToCache(deviceId) {
  const rules = await Rule.findAll({
    where: { device_id: deviceId, enabled: true }
  });
  if (!rules.length) return {};
  const entries = {};
  for (const rule of rules) {
    entries[rule.metric_name] = JSON.stringify(normalizeRuleRecord(rule));
  }
  await redis.hmset(`rules:${deviceId}`, entries);
  return entries;
}

async function getRulesForDevice(deviceId) {
  let rules = await redis.hgetall(`rules:${deviceId}`);
  if (!rules || Object.keys(rules).length === 0) {
    rules = await loadDeviceRulesToCache(deviceId);
  }
  return rules;
}

async function enqueueTelemetry(packet) {
  const { deviceId, metrics, timestamp = Date.now(), packetId } = packet;
  if (!deviceId || !metrics || typeof metrics !== 'object') {
    throw new Error('Invalid telemetry packet payload');
  }
  const finalPacketId = packetId || generatePacketId({ deviceId, metrics, timestamp });
  await redis.xadd(
    'stream:telemetry:ingest',
    '*',
    'packetId',
    finalPacketId,
    'deviceId',
    String(deviceId),
    'timestamp',
    String(timestamp),
    'metrics',
    JSON.stringify(metrics)
  );
  return finalPacketId;
}

async function enqueueTelemetryForPersistence(packet) {
  const { deviceId, metrics, timestamp } = packet;
  await redis.xadd(
    TELEMETRY_PERSIST_STREAM,
    '*',
    'deviceId',
    String(deviceId),
    'timestamp',
    String(timestamp),
    'metrics',
    JSON.stringify(metrics)
  );
}


/**
 * Multi-metric evaluation
 */
async function evaluate(packet) {
  let { packetId, deviceId, metrics, timestamp = Date.now() } = packet;

  if (!deviceId || !metrics) return;
  // Generate packet ID if not provided
  if (!packetId) {
    packetId = generatePacketId({ deviceId, metrics, timestamp });
  }
  // ✅ Check duplicate
  const duplicate = await isDuplicatePacket(packetId);
  if (duplicate) {
    logger.info('duplicate_packet_skipped', { packetId, deviceId });
    return;
  }
  try {
    await storeRawPacket({ deviceId, metrics, timestamp });
    await enqueueTelemetryForPersistence({ deviceId, metrics, timestamp });
    await redis.set(`device:lastSeen:${deviceId}`, timestamp, 'EX', 90);
    const rules = await getRulesForDevice(deviceId);
    if (!rules || Object.keys(rules).length === 0) {
      logger.info('no_rules_for_device', { deviceId });
      return;
    }
    const entries = Object.entries(metrics);
    const concurrency = getMetricEvalConcurrency();
    await runWithConcurrency(entries, concurrency, async ([metric, value]) => {
      await processMetric(deviceId, metric, value, timestamp, rules[metric]);
    });
  } catch (error) {
    logger.error('rule_evaluation_error', { error: error.message, deviceId, packetId });
  }
}

/**
 * Canonical entrypoint for all ingestion paths
 */
async function evaluateFromIngestion(packet) {
  await evaluate(packet);
}


/**
 * Metric rule processing
 */
async function processMetric(deviceId, metric, value, timestamp, ruleData) {
  if (!ruleData) return;
  let rule;
  try {
    rule = JSON.parse(ruleData);
  } catch (e) {
    logger.error('rule_cache_corrupt', { deviceId, metric, error: e.message });
    return;
  }
  const violationKey = `violation:${deviceId}:${metric}`;
  const activeKey = `alert:active:${deviceId}:${metric}`;
  const breachKey = `breach:${deviceId}:${metric}`;
  const outOfRange = value < rule.min || value > rule.max;

  try {
    if (outOfRange) {
      const count = await redis.incr(violationKey);
      await redis.expire(violationKey, 300);
      let breachStart = await redis.get(breachKey);
      if (!breachStart) {
        breachStart = timestamp;
        await redis.set(breachKey, breachStart);
      }
      const elapsedMinutes = (timestamp - parseInt(breachStart, 10)) / (1000 * 60);
      const durationCondition = !rule.duration_minutes || rule.duration_minutes === 0
        ? true
        : elapsedMinutes >= rule.duration_minutes;
      if (count >= rule.packet_threshold && durationCondition) {
        const lock = await redis.set(activeKey, 'LOCK', 'NX', 'EX', 300);
        if (!lock) return;
        const alertId = await alertService.createAlert({
          ruleId: rule.ruleId,
          deviceId,
          metric,
          value,
          min: rule.min,
          max: rule.max,
          severity: rule.severity
        });
        await redis.set(activeKey, alertId);
        await redis.del(violationKey);
        await redis.del(breachKey);
        logger.info('alert_created', { deviceId, metric, alertId });
      }
    } else {
      await redis.del(violationKey);
      await redis.del(breachKey);
      const activeAlertId = await redis.get(activeKey);
      if (activeAlertId && activeAlertId !== 'LOCK') {
        await alertService.resolveAlert(activeAlertId);
        await redis.del(activeKey);
        logger.info('alert_resolved', { deviceId, metric, alertId: activeAlertId });
      }
    }
  } catch (error) {
    logger.error('process_metric_error', {
      error: error.message,
      deviceId,
      metric
    });
  }
}

/**
 * Fetch all rules
 */
async function getAllRules() {
  return Rule.findAll({
    order: [
      ['device_id', 'ASC'],
      ['metric_name', 'ASC']
    ]
  });
}

/**
 * Fetch rule by ID
 */
async function getRuleById(ruleId) {
  return Rule.findByPk(ruleId);
}

/**
 * Create rule
 */
async function createRule(data) {
  const enabled = data.enabled === undefined ? true : Boolean(data.enabled);
  const rule = await Rule.create({
    device_id: String(data.deviceId),
    metric_name: data.metricName,
    min_value: Number(data.minValue),
    max_value: Number(data.maxValue),
    packet_threshold: Number(data.packetThreshold || 1),
    duration_minutes: Number(data.durationMinutes || 0),
    severity: data.severity || 'HIGH',
    enabled
  });
  await cacheRule(rule);
  return rule;
}

/**
 * Update rule
 */
async function updateRule(ruleId, data) {
  const rule = await Rule.findByPk(ruleId);
  if (!rule) return null;

  if (data.minValue !== undefined) rule.min_value = Number(data.minValue);
  if (data.maxValue !== undefined) rule.max_value = Number(data.maxValue);
  if (data.packetThreshold !== undefined) rule.packet_threshold = Number(data.packetThreshold);
  if (data.durationMinutes !== undefined) rule.duration_minutes = Number(data.durationMinutes);
  if (data.severity !== undefined) rule.severity = data.severity;
  if (data.enabled !== undefined) rule.enabled = Boolean(data.enabled);

  await rule.save();
  await cacheRule(rule);
  return rule;
}

/**
 * Delete rule and refresh Redis cache for the device.
 */
async function deleteRule(ruleId) {
  const rule = await Rule.findByPk(ruleId);
  if (!rule) return null;

  const { device_id: deviceId } = rule;
  await rule.destroy();
  await redis.del(`rules:${deviceId}`);
  await loadDeviceRulesToCache(deviceId);
  return true;
}

module.exports = {
  enqueueTelemetry,
  evaluate,
  evaluateFromIngestion,
  getAllRules,
  getRuleById,
  createRule,
  updateRule,
  deleteRule
};