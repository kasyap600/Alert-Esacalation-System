const Alert = require('../db/models/Alert');
const EscalationPolicy = require('../db/models/EscalationPolicy');

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
    console.error('❌ No user/email mapped to device');
    return alert.id;
  }

  // 🔥 Publish notification
  await redis.publish('notification-events', JSON.stringify({
    event: 'ALERT_CREATED',
    alertId: alert.id,
    deviceId: data.deviceId,
    metric: data.metric,
    severity: data.severity,
    notifyTo: email,
    notifyVia: policy.notify_via || 'EMAIL'
  }));

  console.log(`📡 Notification sent to ${email}`); 

  return alert.id;
}
  

async function resolveAlert(alertId) {
  const alert = await Alert.findByPk(alertId);
  if (!alert) return;

  alert.status = 'RESOLVED';
  alert.resolved_at = new Date();
  alert.last_updated_at = new Date();

  await alert.save();
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