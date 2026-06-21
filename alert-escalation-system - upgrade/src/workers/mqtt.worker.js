require('dotenv').config();
const mqtt = require('mqtt');
const rulesService = require('../rules/rules.service');
const { validateTelemetryPayload } = require('../validation/validators');
const logger = require('../utils/logger');

// ─── Config ──────────────────────────────────────────────────────────────────

function getBrokerUrl() {
  const host = process.env.MQTT_HOST || 'localhost';
  const port = process.env.MQTT_PORT || '1883';
  const protocol = process.env.MQTT_PROTOCOL || 'mqtt';
  return `${protocol}://${host}:${port}`;
}

const TOPIC = process.env.MQTT_TOPIC || 'devices/+/telemetry';
const CLIENT_ID = `alert-system-mqtt-${process.pid}`;
const USERNAME = process.env.MQTT_USERNAME || undefined;
const PASSWORD = process.env.MQTT_PASSWORD || undefined;

// ─── Payload normalizer ───────────────────────────────────────────────────────
// Supports two shapes:
//   1. Standard:  { deviceId, metrics: { temp: 95 }, timestamp }
//   2. Flat:      { deviceId, temperature: 95, humidity: 80, timestamp }
//      (any unknown key is treated as a metric)
function normalizePayload(raw, topicDeviceId) {
  const RESERVED = new Set(['deviceId', 'device_id', 'timestamp', 'packetId']);

  const deviceId = raw.deviceId || raw.device_id || topicDeviceId;
  const timestamp = raw.timestamp || Date.now();

  let metrics = raw.metrics;
  if (!metrics || typeof metrics !== 'object') {
    // Flat format — collect non-reserved keys as metrics
    metrics = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!RESERVED.has(k)) metrics[k] = v;
    }
  }

  return { deviceId, metrics, timestamp, packetId: raw.packetId };
}

// Extract deviceId from topic e.g. "devices/sensor-42/telemetry" → "sensor-42"
function deviceIdFromTopic(topic) {
  const parts = topic.split('/');
  if (parts.length >= 3 && parts[0] === 'devices' && parts[2] === 'telemetry') {
    return parts[1];
  }
  return null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function start() {
  const brokerUrl = getBrokerUrl();
  logger.info('mqtt_worker_connecting', { brokerUrl, topic: TOPIC, clientId: CLIENT_ID });

  const client = mqtt.connect(brokerUrl, {
    clientId: CLIENT_ID,
    username: USERNAME,
    password: PASSWORD,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    keepalive: 60,
  });

  client.on('connect', () => {
    logger.info('mqtt_worker_connected', { brokerUrl });
    client.subscribe(TOPIC, { qos: 1 }, (err) => {
      if (err) {
        logger.error('mqtt_subscribe_failed', { topic: TOPIC, error: err.message });
      } else {
        logger.info('mqtt_subscribed', { topic: TOPIC });
      }
    });
  });

  client.on('message', async (topic, buffer) => {
    let raw;
    try {
      raw = JSON.parse(buffer.toString());
    } catch (e) {
      logger.warn('mqtt_invalid_json', { topic, error: e.message });
      return;
    }

    const topicDeviceId = deviceIdFromTopic(topic);
    const normalized = normalizePayload(raw, topicDeviceId);

    const validation = validateTelemetryPayload(normalized);
    if (!validation.ok) {
      logger.warn('mqtt_payload_invalid', { topic, error: validation.error, raw });
      return;
    }

    try {
      const packetId = await rulesService.enqueueTelemetry(validation.value);
      logger.info('mqtt_packet_enqueued', {
        topic,
        deviceId: validation.value.deviceId,
        metrics: Object.keys(validation.value.metrics),
        packetId,
      });
    } catch (err) {
      logger.error('mqtt_enqueue_failed', { topic, error: err.message });
    }
  });

  client.on('reconnect', () => {
    logger.info('mqtt_worker_reconnecting', { brokerUrl });
  });

  client.on('offline', () => {
    logger.warn('mqtt_worker_offline', { brokerUrl });
  });

  client.on('error', (err) => {
    logger.error('mqtt_worker_error', { error: err.message });
  });
}

start();
