const nodemailer = require('nodemailer');
const redis = require('../ingestion/redis');

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
    console.error('❌ Email transporter error:', error);
  } else {
    console.log('✅ Email server ready');
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
    console.log('⚠️ Rate limited:', event.deviceId);
    return true;
  }

  return false;
}

// ===============================
// Send Notification
// ===============================
async function sendNotification({ channel, to, message }) {

  if (channel !== 'EMAIL') {
    console.log('⚠️ Unsupported channel. Skipping.');
    return;
  }

  if (!to) {
    console.error('❌ Missing recipient');
    return;
  }

  const subject = `[ALERT] ${message.deviceId} - ${message.metric}`;

  const body = `
Alert Triggered 🚨

Device: ${message.deviceId}
Metric: ${message.metric}
Value: ${message.value}
Threshold: ${message.threshold}

Time: ${new Date().toISOString()}
`;

  await transporter.sendMail({
    from: `"Alert System" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text: body
  });

  console.log('✅ Email sent to', to);
}

// ===============================
// Retry Wrapper
// ===============================
async function sendWithRetry(payload, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await sendNotification(payload);
      console.log(`✅ Success on attempt ${attempt}`);
      return;
    } catch (err) {
      console.warn(`⚠️ Attempt ${attempt} failed`);

      if (attempt === retries) {
        console.error('❌ All retries failed', err);
      } else {
        await new Promise(res => setTimeout(res, 1000 * attempt));
      }
    }
  }
}

// ===============================
// 🔥 LISTENER (FIXED for Redis v4)
// ===============================
async function startNotificationListener() {

  const subscriber = redis.duplicate();
  //await subscriber.connect(); // ✅ REQUIRED for v4

  console.log('📡 Notification Service Listening...');

  await subscriber.subscribe('notification-events', async (message) => {
    try {
      const event = JSON.parse(message);
      if (!event || !event.event) {
        console.warn("⚠️ Invalid event received:", event);
        return;
      }
      console.log('📥 Event received:', event.event);

      // ✅ Rate limit check
      if (await isRateLimited(event)) return;

      const payload = {
        channel: event.notifyVia || 'EMAIL',
        to: event.notifyTo,
        message: event
      };

      // ✅ Non-blocking async processing
      sendWithRetry(payload).catch(err => {
        console.error('❌ Async send failed:', err);
      });

    } catch (err) {
      console.error('❌ Notification listener error:', err);
    }
  });
}

module.exports = { sendNotification, startNotificationListener };