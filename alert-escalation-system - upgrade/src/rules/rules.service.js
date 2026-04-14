const redis = require('../ingestion/redis');
const alertService = require('../alerts/alert.service');

/**
 * Store raw telemetry packet in Redis Stream
 */
async function storeRawPacket(packet) {
  const { deviceId, metrics, timestamp } = packet;

  const streamKey = `telemetry:device:${deviceId}`;

  try {
    await redis.xadd(
      streamKey,
      '*',
      'deviceId',
      deviceId,
      'metrics',
      JSON.stringify(metrics),
      'timestamp',
      timestamp
    );
  } catch (err) {
    console.error('Redis stream store error:', err);
  }
}



//TO check for duplicates packets
const crypto = require('crypto');

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

  const result = await redis.set(
    key,
    1,
    'NX',   // only set if not exists
    'EX',
    120     // 2 minutes TTL
  );

  return result === null;
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
  const isDuplicate = await isDuplicatePacket(packetId);
  if (isDuplicate) {
    console.log(`⚠️ Duplicate packet skipped: ${packetId}`);
    return;
  }
  try {

    // Store raw packet
    await redis.lpush(
    'telemetryQueue',
    JSON.stringify({ deviceId, metrics, timestamp })
    );

    // Update device heartbeat
    await redis.set(`device:lastSeen:${deviceId}`, timestamp, 'EX', 90);

    // Fetch rules for device
    const rules = await redis.hgetall(`rules:${deviceId}`);

    if (!rules || Object.keys(rules).length === 0) {
      console.log(`No rules configured for device ${deviceId}`);
      return;
    }

    const tasks = Object.entries(metrics).map(
      ([metric, value]) =>
        processMetric(deviceId, metric, value, timestamp, rules[metric])
    );

    await Promise.all(tasks);

  } catch (error) {
    console.error('Rule evaluation error:', error);
  }
}


/**
 * Metric rule processing
 */
async function processMetric(deviceId, metric, value, timestamp, ruleData) {

  if (!ruleData) return;

  const rule = JSON.parse(ruleData);

  const violationKey = `violation:${deviceId}:${metric}`;
  const activeKey = `alert:active:${deviceId}:${metric}`;
  const breachKey = `breach:${deviceId}:${metric}`; // ✅ NEW

  const outOfRange = value < rule.min || value > rule.max;

  try {

    // ----------- CASE 1: VIOLATION -------------

    if (outOfRange) {

      // Increment violation counter
      const count = await redis.incr(violationKey);
      await redis.expire(violationKey, 300);

      // Get or set breach start time
      let breachStart = await redis.get(breachKey);

      if (!breachStart) {
        breachStart = timestamp;
        await redis.set(breachKey, breachStart);
      }

      const elapsedMinutes =
        (timestamp - parseInt(breachStart)) / (1000 * 60);

      console.log(
        `⚠️ ${deviceId}:${metric} count=${count}/${rule.packet_threshold} | time=${elapsedMinutes.toFixed(2)}/${rule.duration_minutes || 0}`
      );

      // ✅ HYBRID CONDITION
      const durationCondition =
        !rule.duration_minutes || rule.duration_minutes === 0
          ? true
          : elapsedMinutes >= rule.duration_minutes;

      if (
        count >= rule.packet_threshold &&
        durationCondition
      ) {
        
        const lock = await redis.set(
          activeKey,
          'LOCK',
          'NX',
          'EX',
          300
        );

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
        
        // Replace LOCK with actual alertId
        await redis.set(activeKey, alertId);

        await redis.del(violationKey);
        await redis.del(breachKey);

        console.log(`🚨 Alert created for ${deviceId}:${metric}`);
      }

    }

    // ----------- CASE 2: NORMAL -------------

    else {

      await redis.del(violationKey);
      await redis.del(breachKey); // ✅ NEW

      const activeAlertId = await redis.get(activeKey);

      if (activeAlertId && activeAlertId !== 'LOCK') {

        await alertService.resolveAlert(activeAlertId);
        await redis.del(activeKey);

        console.log(`✅ Alert resolved for ${deviceId}:${metric}`);
      }
    }

  } catch (error) {
    console.error(`Error processing metric ${metric}:`, error);
  }
}

/**
 * Legacy rule evaluation (DB rule object)
 */
async function processTelemetry(rule, value) {

  const {
    id: ruleId,
    device_id: deviceId,
    metric_name: metric,
    min_value: min,
    max_value: max,
    duration_minutes,
    severity
  } = rule;

  const breachKey = `breach:${deviceId}:${metric}`;
  const activeKey = `alert:active:${deviceId}:${metric}`;
  const timestamp = Date.now();

  const outOfRange = value < min || value > max;

  try {

    if (outOfRange) {

      const activeAlertId = await redis.get(activeKey);
      if (activeAlertId) return;

      const breachStart = await redis.get(breachKey);

      if (!breachStart) {

        console.log(`⏳ Breach started for ${deviceId}:${metric}`);

        await redis.set(breachKey, timestamp);

        return;
      }

      const elapsedMinutes =
        (timestamp - parseInt(breachStart)) / (1000 * 60);

      console.log(
        `⏱ ${deviceId}:${metric} elapsed = ${elapsedMinutes.toFixed(2)} min | required = ${duration_minutes}`
      );

      if (elapsedMinutes >= duration_minutes) {

        const alertId = await alertService.createAlert({
          ruleId,
          deviceId,
          metric,
          value,
          min,
          max,
          severity
        });

        await redis.set(activeKey, alertId);

        await redis.del(breachKey);

        console.log(`🚨 Alert created for ${deviceId}:${metric}`);
      }

    }

    else {

      await redis.del(breachKey);

      const activeAlertId = await redis.get(activeKey);

      if (activeAlertId) {

        await alertService.resolveAlert(activeAlertId);

        await redis.del(activeKey);

        console.log(`✅ Alert resolved for ${deviceId}:${metric}`);
      }
    }

  } catch (error) {

    console.error(`Error processing telemetry for ${metric}:`, error);
  }
}
const { Rule } = require('../db/models');

/**
 * Fetch all rules
 */
async function getAllRules() {

  const rules = await Rule.findAll({
    order: [
      ['device_id', 'ASC'],
      ['metric_name', 'ASC']
    ]
  });

  return rules;
}

/**
 * Fetch rule by ID
 */
async function getRuleById(ruleId) {

  const rule = await Rule.findByPk(ruleId);

  return rule;

}


const ruleCache = require('./ruleCache');

/**
 * Create rule
 */
async function createRule(data) {

  const {
    deviceId,
    metricName,
    minValue,
    maxValue,
    packetThreshold,
    durationMinutes,
    severity,
    enabled
  } = data;

  // Save to DB
  const rule = await Rule.create({
    device_id: deviceId,
    metric_name: metricName,
    min_value: minValue,
    max_value: maxValue,
    packet_threshold: Number(packetThreshold),
    duration_minutes: durationMinutes || 1,
    severity,
    enabled
  });

  // If enabled → update Redis + memory cache
  if (enabled) {

    const ruleData = {
      ruleId: rule.id,
      min: minValue,
      max: maxValue,
      packet_threshold: packetThreshold,
      duration_minutes: durationMinutes || 1,
      severity
    };

    // Redis cache
    await redis.hset(
      `rules:${deviceId}`,
      metricName,
      JSON.stringify(ruleData)
    );

    // Memory cache
    if (!ruleCache[deviceId]) {
      ruleCache[deviceId] = {};
    }

    ruleCache[deviceId][metricName] = ruleData;
  }

  return rule;
}

/**
 * Update rule
 */
async function updateRule(ruleId, data) {

  const {
    minValue,
    maxValue,
    packetThreshold,
    durationMinutes,
    severity,
    enabled
  } = data;

  const rule = await Rule.findByPk(ruleId);

  if (!rule) return null;

  // Update DB fields
  rule.min_value = minValue;
  rule.max_value = maxValue;
  rule.packet_threshold = Number(packetThreshold);
  rule.duration_minutes = durationMinutes || 1;
  rule.severity = severity;
  rule.enabled = enabled;

  await rule.save();

  const deviceId = rule.device_id;
  const metricName = rule.metric_name;

  const ruleData = {
    ruleId: rule.id,
    min: rule.min_value,
    max: rule.max_value,
    packet_threshold: rule.packet_threshold,
    duration_minutes: rule.duration_minutes,
    severity: rule.severity
  };

  // ---------- Redis Cache Update ----------

  if (enabled) {

    await redis.hset(
      `rules:${deviceId}`,
      metricName,
      JSON.stringify(ruleData)
    );

  } else {

    await redis.hdel(
      `rules:${deviceId}`,
      metricName
    );

  }

  // ---------- Memory Cache Update ----------

  if (!ruleCache[deviceId]) {
    ruleCache[deviceId] = {};
  }

  if (enabled) {

    ruleCache[deviceId][metricName] = ruleData;

  } else {

    delete ruleCache[deviceId][metricName];

  }

  return rule;
}


module.exports = {
  evaluate,
  processTelemetry,
  getAllRules,
  getRuleById,
  createRule,
  updateRule
};