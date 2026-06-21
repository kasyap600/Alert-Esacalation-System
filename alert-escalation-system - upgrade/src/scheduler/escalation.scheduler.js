const cron = require('node-cron');
const { Op } = require('sequelize');
const redis = require('../ingestion/redis');
const Alert = require('../db/models/Alert');
const EscalationPolicy = require('../db/models/EscalationPolicy');
const AlertEscalation = require('../db/models/AlertEscalation');
const logger = require('../utils/logger');

const BATCH_SIZE = 200;

function startEscalationScheduler() {
  let running = false;

  return cron.schedule('* * * * *', async () => {
    if (running) {
      logger.warn('escalation_scheduler_skipped_busy');
      return;
    }
    running = true;

    logger.info('escalation_scheduler_tick');

    try {
      await processBatched();
    } catch (error) {
      logger.error('escalation_scheduler_failed', { error: error.message });
    } finally {
      running = false;
    }
  });
}

async function processBatched() {
  let offset = 0;

  while (true) {
    const alerts = await Alert.findAll({
      where: { status: { [Op.in]: ['OPEN', 'ACKNOWLEDGED'] } },
      order: [['id', 'ASC']],
      limit: BATCH_SIZE,
      offset
    });

    if (!alerts.length) break;

    logger.info('escalation_batch', { offset, count: alerts.length });

    // Batch-load all escalation policies for the rule IDs in this batch
    const ruleIds = [...new Set(alerts.map((a) => a.rule_id).filter(Boolean))];
    const allPolicies = await EscalationPolicy.findAll({
      where: { rule_id: { [Op.in]: ruleIds } },
      order: [['level', 'ASC']]
    });

    // Group policies by rule_id for O(1) lookup
    const policiesByRule = {};
    for (const p of allPolicies) {
      if (!policiesByRule[p.rule_id]) policiesByRule[p.rule_id] = [];
      policiesByRule[p.rule_id].push(p);
    }

    const now = new Date();

    for (const alert of alerts) {
      try {
        if (!alert.rule_id) {
          logger.warn('skipping_alert_without_rule', { alertId: alert.id });
          continue;
        }

        const policies = policiesByRule[alert.rule_id] || [];
        if (!policies.length) {
          logger.info('no_escalation_policies', { alertId: alert.id, ruleId: alert.rule_id });
          continue;
        }

        const nextLevel = alert.current_level + 1;
        const nextPolicy = policies.find((p) => p.level === nextLevel);
        if (!nextPolicy) continue;

        const referenceTime =
          alert.current_level === 0
            ? alert.first_triggered_at
            : alert.last_updated_at;

        const minutesElapsed = (now - referenceTime) / 60000;

        if (minutesElapsed >= nextPolicy.escalate_after_minutes) {
          const lockKey = `escalation:${alert.id}:${nextLevel}`;
          const lock = await redis.set(lockKey, 1, 'NX', 'EX', 120);
          if (!lock) continue;

          const alreadyEscalated = await AlertEscalation.findOne({
            where: { alert_id: alert.id, level: nextPolicy.level }
          });
          if (alreadyEscalated) {
            await redis.del(lockKey);
            continue;
          }

          await AlertEscalation.create({
            alert_id: alert.id,
            level: nextPolicy.level,
            notified_at: now
          });
          alert.current_level = nextPolicy.level;
          alert.last_updated_at = now;
          await alert.save();

          // Sanitize interpolated fields to strip control characters before
          // embedding them in the notification payload subject line.
          const safeDeviceId = String(alert.device_id).replace(/[\r\n]/g, '');
          const safeMetric = String(alert.metric_name).replace(/[\r\n]/g, '');

          await redis.publish(
            'notification-events',
            JSON.stringify({
              event: 'ESCALATION',
              summary: `Alert ${alert.id} escalated to level ${nextPolicy.level}`,
              alertId: alert.id,
              ruleId: alert.rule_id,
              deviceId: safeDeviceId,
              metric: safeMetric,
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
          logger.info('alert_escalated', { alertId: alert.id, level: nextPolicy.level });
        }
      } catch (alertError) {
        logger.error('escalation_alert_error', { alertId: alert.id, error: alertError.message });
      }
    }

    if (alerts.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }
}

module.exports = { startEscalationScheduler };
