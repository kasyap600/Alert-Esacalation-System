const cron = require('node-cron');
const redis = require('../ingestion/redis'); 
const Alert = require('../db/models/Alert');
const EscalationPolicy = require('../db/models/EscalationPolicy');
const AlertEscalation = require('../db/models/AlertEscalation');
const logger = require('../utils/logger');

function startEscalationScheduler() {
  return cron.schedule('* * * * *', async () => {

  logger.info('escalation_scheduler_tick');

  try {

    const alerts = await Alert.findAll({
      where: { status: ['OPEN', 'ACKNOWLEDGED'] }
    });

    logger.info('open_alerts_found', { count: alerts.length });

    const now = new Date();

    for (const alert of alerts) {

      try {

        if (!alert.rule_id) {
          logger.warn('skipping_alert_without_rule', { alertId: alert.id });
          continue;
        }

        // Fetch escalation policies
        const policies = await EscalationPolicy.findAll({
          where: { rule_id: alert.rule_id },
          order: [['level', 'ASC']]
        });

        if (!policies.length) {
          logger.info('no_escalation_policies', { alertId: alert.id, ruleId: alert.rule_id });
          continue;
        }

        // Next escalation level
        const nextLevel = alert.current_level + 1;

        const nextPolicy = policies.find(
          p => p.level === nextLevel
        );

        if (!nextPolicy) {
          continue;
        }

        // Time check
        const referenceTime =
          alert.current_level === 0
            ? alert.first_triggered_at
            : alert.last_updated_at;

        const minutesElapsed =
          (now - referenceTime) / 60000;

        if (minutesElapsed >= nextPolicy.escalate_after_minutes) {
          const lockKey = `escalation:${alert.id}:${nextLevel}`;
          const lock = await redis.set(
            lockKey,
            1,
            'NX',
            'EX',
            120
          );
          if (!lock) {
            continue;
          }
          const alreadyEscalated = await AlertEscalation.findOne({
            where: { alert_id: alert.id, level: nextPolicy.level }
          });
          if (alreadyEscalated) {
            continue;
          }
          await redis.publish(
            'notification-events',
            JSON.stringify({
              event: 'ESCALATION',
              summary: `Alert ${alert.id} escalated to level ${nextPolicy.level}`,
              alertId: alert.id,
              ruleId: alert.rule_id,
              deviceId: alert.device_id,
              metric: alert.metric_name,
              value: alert.current_value,
              min: alert.min_value,
              max: alert.max_value,
              severity: alert.severity,
              status: alert.status,
              currentLevel: alert.current_level,
              escalatedToLevel: nextPolicy.level,
              minutesElapsed: Number(minutesElapsed.toFixed(2)),
              escalateAfterMinutes: nextPolicy.escalate_after_minutes,
              notifyVia: nextPolicy.notify_via,
              notifyTo: nextPolicy.notify_to,
              firstTriggeredAt: alert.first_triggered_at,
              triggeredAt: alert.triggered_at,
              acknowledgedAt: alert.acknowledged_at,
              resolvedAt: alert.resolved_at,
              acknowledgedBy: alert.acknowledged_by,
              lastUpdatedAt: alert.last_updated_at,
              processedAt: now.toISOString()
            })
          );

          await AlertEscalation.create({
            alert_id: alert.id,
            level: nextPolicy.level,
            notified_at: now
          });
          alert.current_level = nextPolicy.level;
          alert.last_updated_at = now;
          await alert.save();
          logger.info('alert_escalated', { alertId: alert.id, level: nextPolicy.level });
        }
      } catch (alertError) {
        logger.error('escalation_alert_error', { alertId: alert.id, error: alertError.message });
      }
    }

  } catch (error) {
    logger.error('escalation_scheduler_failed', { error: error.message });
  }
  });
}

module.exports = { startEscalationScheduler };