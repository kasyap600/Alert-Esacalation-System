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

async function enqueueTelemetryForPersistence(packet) {
  const { deviceId, metrics, timestamp } = packet;
  await redis.xadd(
    TELEMETRY_PERSIST_STREAM,
    'MAXLEN', '~', '100000',
    '*',
    'deviceId', String(deviceId),
    'timestamp', String(timestamp),
    'metrics', JSON.stringify(metrics)
  );
}

// Stable JSON stringify: sorts keys so packet ID is key-order independent
function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return JSON.stringify(obj);
  }
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${JSON.stringify(obj[k])}`);
  return `{${parts.join(',')}}`;
}

function generatePacketId(packet) {
  return crypto
    .createHash('sha256')
    .update(packet.deviceId + stableStringify(packet.metrics) + packet.timestamp)
    .digest('hex');
}

async function isDuplicatePacket(packetId) {
  const key = `packet:${packetId}`;
  const ttlSec = getPacketDedupeTtlSeconds();
  const result = await redis.set(key, 1, 'NX', 'EX', ttlSec);
  return result === null;
}

function normalizeRuleRecord(rule) {
  return {
    ruleId: rule.id,
    min: Number(rule.min_value),
    max: Number(rule.max_value),
    packet_threshold: Number(rule.packet_threshold ?? 3),
    duration_minutes: Number(rule.duration_minutes ?? 0),
    severity: rule.severity || 'HIGH',
    trigger_mode: rule.trigger_mode || 'BOTH'
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

  // Cache negative result so we don't hit DB on every packet for devices with no rules
  if (!rules.length) {
    await redis.set(`rules:noRules:${deviceId}`, 1, 'EX', 60);
    return {};
  }

  const entries = {};
  for (const rule of rules) {
    entries[rule.metric_name] = JSON.stringify(normalizeRuleRecord(rule));
  }
  await redis.hmset(`rules:${deviceId}`, entries);
  return entries;
}

async function getRulesForDevice(deviceId) {
  // Fast path: device is known to have no rules (cached for 60s)
  const noRulesFlag = await redis.get(`rules:noRules:${deviceId}`);
  if (noRulesFlag) return null;

  let rules = await redis.hgetall(`rules:${deviceId}`);
  if (!rules || Object.keys(rules).length === 0) {
    rules = await loadDeviceRulesToCache(deviceId);
  }
  return rules && Object.keys(rules).length > 0 ? rules : null;
}

async function enqueueTelemetry(packet) {
  const { deviceId, metrics, timestamp = Date.now(), packetId } = packet;
  if (!deviceId || !metrics || typeof metrics !== 'object') {
    throw new Error('Invalid telemetry packet payload');
  }
  const finalPacketId = packetId || generatePacketId({ deviceId, metrics, timestamp });
  await redis.xadd(
    'stream:telemetry:ingest',
    'MAXLEN', '~', '100000',
    '*',
    'packetId', finalPacketId,
    'deviceId', String(deviceId),
    'timestamp', String(timestamp),
    'metrics', JSON.stringify(metrics)
  );
  return finalPacketId;
}

/**
 * Multi-metric evaluation — main entry point from the rule-eval worker
 */
async function evaluate(packet) {
  let { packetId, deviceId, metrics, timestamp = Date.now() } = packet;

  if (!deviceId || !metrics) return;

  if (!packetId) {
    packetId = generatePacketId({ deviceId, metrics, timestamp });
  }

  const duplicate = await isDuplicatePacket(packetId);
  if (duplicate) {
    logger.info('duplicate_packet_skipped', { packetId, deviceId });
    return;
  }

  try {
    await enqueueTelemetryForPersistence({ deviceId, metrics, timestamp });
    await redis.set(`device:lastSeen:${deviceId}`, timestamp, 'EX', 90);

    const rules = await getRulesForDevice(deviceId);
    if (!rules) {
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
 * Evaluate a single metric against its cached rule.
 *
 * Violation window design:
 *   - violationKey: anchored at first violation, TTL = rule window + 60s buffer.
 *     Expires naturally so the window is fixed, not sliding.
 *   - breachKey: records the timestamp of the first violation in this window.
 *     Same TTL as violationKey.
 *   - activeKey: holds 'LOCK' while alert creation is in flight, then alert ID.
 *     Cleared when the metric returns to range (auto-resolve).
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
  const activeKey   = `alert:active:${deviceId}:${metric}`;
  const breachKey   = `breach:${deviceId}:${metric}`;

  // Safe zone is [min, max) — min inclusive, max exclusive.
  // value >= max is a violation so that a reading exactly at the ceiling fires the alert.
  const outOfRange = value < rule.min || value >= rule.max;

  // Window TTL: rule duration + 60s buffer so state doesn't expire mid-window.
  // Minimum 300s so short-duration rules still have a reasonable dedup window.
  const windowSecs = Math.max((rule.duration_minutes || 5) * 60 + 60, 300);

  try {
    if (outOfRange) {
      // Atomically initialise the counter to 1 if the key doesn't exist yet, anchoring
      // the window.  If it already exists, INCR simply increments it.  Using SET NX + INCR
      // as two separate commands would race between workers, so we SET 0 NX then INCR —
      // worst case two workers both see count=1 on the same packet, but only the first
      // to acquire the LOCK (activeKey NX below) will create the alert.
      const setResult = await redis.set(violationKey, 0, 'NX', 'EX', windowSecs);
      if (setResult !== null) {
        // Key was newly created — set the expiry in the same command above.
        // No separate EXPIRE needed.
      }
      const count = await redis.incr(violationKey);

      // Record breach start time once per window
      let breachStart = await redis.get(breachKey);
      if (!breachStart) {
        breachStart = timestamp;
        await redis.set(breachKey, breachStart, 'EX', windowSecs);
      }

      const elapsedMinutes = (timestamp - parseInt(breachStart, 10)) / (1000 * 60);
      const triggerMode = rule.trigger_mode || 'BOTH';

      const countCondition = triggerMode === 'DURATION_ONLY'
        ? true                                          // count irrelevant — only need ≥1 reading (already have it)
        : count >= rule.packet_threshold;

      const durationCondition = triggerMode === 'PACKET_ONLY'
        ? true                                          // time irrelevant
        : (!rule.duration_minutes || rule.duration_minutes === 0
            ? true
            : elapsedMinutes >= rule.duration_minutes);

      logger.info('rule_violation', {
        deviceId, metric, value,
        min: rule.min, max: rule.max,
        count, threshold: rule.packet_threshold,
        elapsedMinutes: Number(elapsedMinutes.toFixed(2)),
        triggerMode, countCondition, durationCondition
      });

      if (countCondition && durationCondition) {
        const lock = await redis.set(activeKey, 'LOCK', 'NX', 'EX', 300);
        if (!lock) return; // Another worker is already creating the alert

        let alertId;
        try {
          alertId = await alertService.createAlert({
            ruleId: rule.ruleId,
            deviceId,
            metric,
            value,
            min: rule.min,
            max: rule.max,
            severity: rule.severity
          });
        } catch (createErr) {
          await redis.del(activeKey);
          throw createErr;
        }

        // Promote the lock to hold the alert ID.  If this or the cleanup calls
        // fail, release the lock so a future packet can retry rather than being
        // blocked for the full 300-second TTL.
        try {
          await redis.set(activeKey, String(alertId));
          await redis.del(violationKey);
          await redis.del(breachKey);
        } catch (postCreateErr) {
          logger.error('alert_post_create_redis_failed', { deviceId, metric, alertId, error: postCreateErr.message });
          await redis.del(activeKey).catch(() => {});
          throw postCreateErr;
        }
        logger.info('alert_created', { deviceId, metric, alertId });
      }
    } else {
      // Value back in range — clear violation state
      await redis.del(violationKey);
      await redis.del(breachKey);

      const activeAlertId = await redis.get(activeKey);
      if (activeAlertId !== null && activeAlertId !== 'LOCK') {
        await alertService.resolveAlert(activeAlertId);
        await redis.del(activeKey);
        logger.info('alert_auto_resolved', { deviceId, metric, alertId: activeAlertId });
      }
    }
  } catch (error) {
    logger.error('process_metric_error', { error: error.message, deviceId, metric });
  }
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

async function getAllRules({ limit, offset, deviceId } = {}) {
  const where = {};
  if (deviceId) where.device_id = deviceId;
  if (limit !== undefined) {
    return Rule.findAndCountAll({
      where,
      order: [['device_id', 'ASC'], ['metric_name', 'ASC']],
      limit,
      offset: offset ?? 0
    });
  }
  const rows = await Rule.findAll({ where, order: [['device_id', 'ASC'], ['metric_name', 'ASC']] });
  return { count: rows.length, rows };
}

async function getRuleById(ruleId) {
  return Rule.findByPk(ruleId);
}

async function createRule(data) {
  const enabled = data.enabled === undefined ? true : Boolean(data.enabled);
  const rule = await Rule.create({
    device_id:        String(data.deviceId),
    metric_name:      data.metricName,
    min_value:        Number(data.minValue),
    max_value:        Number(data.maxValue),
    packet_threshold: Number(data.packetThreshold ?? 3),
    duration_minutes: Number(data.durationMinutes ?? 0),
    severity:         data.severity || 'HIGH',
    enabled,
    trigger_mode:     data.triggerMode || 'BOTH'
  });
  // Clear any cached "no rules" sentinel for this device
  await redis.del(`rules:noRules:${rule.device_id}`);
  await cacheRule(rule);
  return rule;
}

async function updateRule(ruleId, data) {
  const rule = await Rule.findByPk(ruleId);
  if (!rule) return null;

  let changed = false;
  if (data.minValue !== undefined)        { rule.min_value = Number(data.minValue);           changed = true; }
  if (data.maxValue !== undefined)        { rule.max_value = Number(data.maxValue);           changed = true; }
  if (data.packetThreshold !== undefined) { rule.packet_threshold = Number(data.packetThreshold); changed = true; }
  if (data.durationMinutes !== undefined) { rule.duration_minutes = Number(data.durationMinutes); changed = true; }
  if (data.severity !== undefined)        { rule.severity = data.severity;                    changed = true; }
  if (data.enabled !== undefined)         { rule.enabled = Boolean(data.enabled);             changed = true; }
  if (data.triggerMode !== undefined)     { rule.trigger_mode = data.triggerMode;              changed = true; }

  if (!changed) return { rule, changed: false };

  await rule.save();
  await cacheRule(rule);
  return { rule, changed: true };
}

async function deleteRule(ruleId) {
  const rule = await Rule.findByPk(ruleId);
  if (!rule) return null;

  const { device_id: deviceId, metric_name: metricName } = rule;
  await rule.destroy();
  await redis.hdel(`rules:${deviceId}`, metricName);
  return true;
}

module.exports = {
  enqueueTelemetry,
  evaluate,
  getAllRules,
  getRuleById,
  createRule,
  updateRule,
  deleteRule,
  cacheRule,
  loadDeviceRulesToCache
};
