const Alert = require('../db/models/Alert');
const EscalationPolicy = require('../db/models/EscalationPolicy');
const redis = require('../ingestion/redis');
const logger = require('../utils/logger');

async function createAlert(data) {
  const alert = await Alert.create({
    rule_id: data.ruleId,
    device_id: data.deviceId,

    metric_name: data.metric,
    current_value: data.value,
    min_value: data.min,
    max_value: data.max,
    severity: data.severity,

    status: 'OPEN',
    current_level: 0,

    first_triggered_at: new Date(),
    triggered_at: new Date(),
    last_updated_at: new Date()
  });

  // 🔥 Fetch user email dynamically
  const policy = await EscalationPolicy.findOne({
    where: {
      rule_id: data.ruleId,
      level: 0
    }
  });

  const email = policy?.notify_to;

  if (!email) {
    logger.warn('alert_no_escalation_policy_email', {
      alertId: alert.id,
      ruleId: data.ruleId,
      hint: 'Add EscalationPolicy level 0 with notify_to for this rule to receive notifications.'
    });
    return alert.id;
  }

  try {
    await redis.publish('notification-events', JSON.stringify({
      event: 'ALERT_CREATED',
      alertId: alert.id,
      deviceId: data.deviceId,
      metric: data.metric,
      value: data.value,
      min: data.min,
      max: data.max,
      severity: data.severity,
      notifyTo: email,
      notifyVia: policy.notify_via || 'EMAIL'
    }));
    logger.info('notification_published', { alertId: alert.id, notifyTo: email });
  } catch (err) {
    logger.error('notification_publish_failed', { alertId: alert.id, error: err.message });
  }

  return alert.id;
}
  

async function resolveAlert(alertId) {
  const alert = await Alert.findByPk(alertId);
  if (!alert) return;

  alert.status = 'RESOLVED';
  alert.resolved_at = new Date();
  alert.last_updated_at = new Date();

  await alert.save();
  logger.info('alert_resolved_db', { alertId });
}

async function acknowledgeAlert(alertId, acknowledgedBy) {
  const alert = await Alert.findByPk(alertId);
  if (!alert) return;

  alert.status = 'ACKNOWLEDGED';
  alert.acknowledged_at = new Date();
  alert.acknowledged_by = acknowledgedBy || null;
  alert.last_updated_at = new Date();

  await alert.save();
}

module.exports = {
  createAlert,
  resolveAlert,
  acknowledgeAlert
};