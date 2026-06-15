const nodemailer = require('nodemailer');
const redis = require('../ingestion/redis');
const logger = require('../utils/logger');

const NOTIFICATION_DLQ_STREAM = 'stream:notification:dlq';

function getNotificationMaxRetries() {
  const raw = process.env.NOTIFICATION_MAX_RETRIES;
  if (raw === undefined || raw === '') return 3;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 3;
  return Math.min(Math.floor(n), 20);
}

async function pushNotificationDlq({ payload, error, attempts }) {
  const event = payload.message || payload;
  await redis.xadd(
    NOTIFICATION_DLQ_STREAM,
    '*',
    'event',
    JSON.stringify(event),
    'error',
    error?.message || String(error),
    'attempts',
    String(attempts),
    'failedAt',
    new Date().toISOString()
  );
}

// ===============================
// Create Transporter
// ===============================
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT),
  secure: Number(process.env.EMAIL_PORT) === 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ===============================
// Verify transporter
// ===============================
transporter.verify((error) => {
  if (error) {
    logger.error('email_transporter_verify_failed', { error: error.message });
  } else {
    logger.info('email_transporter_ready');
  }
});

// ===============================
// Rate Limiter (per device)
// ===============================
async function isRateLimited(event) {
  const key = `alert:${event.deviceId}`;

  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, 60); // 1 min window
  }

  if (count > 5) {
    logger.warn('notification_rate_limited', { deviceId: event.deviceId });
    return true;
  }

  return false;
}

// ===============================
// Send Notification
// ===============================
async function sendNotification({ channel, to, message }) {

  if (channel !== 'EMAIL') {
    logger.warn('notification_unsupported_channel', { channel });
    return;
  }

  if (!to) {
    logger.error('notification_missing_recipient', {});
    return;
  }

  const subject = `[ALERT] ${message.deviceId} - ${message.metric}`;

  const thresholdText =
    message.min != null && message.max != null
      ? `${message.min} – ${message.max}`
      : (message.threshold != null ? String(message.threshold) : 'n/a');

  const body = `
Alert Triggered 🚨

Device: ${message.deviceId}
Metric: ${message.metric}
Value: ${message.value != null ? message.value : 'n/a'}
Threshold: ${thresholdText}

Time: ${new Date().toISOString()}
`;

  await transporter.sendMail({
    from: `"Alert System" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text: body
  });

  logger.info('notification_email_sent', { to });
}

// ===============================
// Retry Wrapper
// ===============================
async function sendWithRetry(payload) {
  const retries = getNotificationMaxRetries();
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sendNotification(payload);
      logger.info('notification_send_ok', { attempt, retries });
      return;
    } catch (err) {
      lastErr = err;
      logger.warn('notification_send_attempt_failed', {
        attempt,
        retries,
        error: err.message
      });
      if (attempt < retries) {
        await new Promise((res) => setTimeout(res, 1000 * attempt));
      }
    }
  }
  try {
    await pushNotificationDlq({ payload, error: lastErr, attempts: retries });
    logger.error('notification_moved_to_dlq', {
      error: lastErr?.message,
      to: payload.to
    });
  } catch (dlqErr) {
    logger.error('notification_dlq_write_failed', { error: dlqErr.message });
  }
}

// ===============================
// 🔥 LISTENER (FIXED for Redis v4)
// ===============================
async function startNotificationListener() {

  const subscriber = redis.duplicate();
  //await subscriber.connect(); // ✅ REQUIRED for v4

  logger.info('notification_listener_started');

  subscriber.on('message', async (_channel, message) => {
    try {
      const event = JSON.parse(message);
      if (!event || !event.event) {
        logger.warn('notification_invalid_event', { raw: String(message).slice(0, 200) });
        return;
      }
      logger.info('notification_event_received', { event: event.event });

      if (await isRateLimited(event)) return;

      const payload = {
        channel: event.notifyVia || 'EMAIL',
        to: event.notifyTo,
        message: event
      };

      sendWithRetry(payload).catch((err) => {
        logger.error('notification_send_unhandled', { error: err.message });
      });
    } catch (err) {
      logger.error('notification_listener_error', { error: err.message });
    }
  });

  await subscriber.subscribe('notification-events');
}

module.exports = { sendNotification, startNotificationListener };