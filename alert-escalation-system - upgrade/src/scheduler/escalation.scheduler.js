const cron = require('node-cron');
const redis = require('../ingestion/redis'); 
const Alert = require('../db/models/Alert');
const EscalationPolicy = require('../db/models/EscalationPolicy');

cron.schedule('* * * * *', async () => {

  console.log('======================================');
  console.log('Escalation scheduler running at:', new Date().toISOString());
  console.log('======================================');

  try {

    const alerts = await Alert.findAll({
      where: { status: ['OPEN', 'ACKNOWLEDGED'] }
    });

    console.log('Open alerts found:', alerts.length);

    const now = new Date();

    for (const alert of alerts) {

      try {

        console.log('--------------------------------------');
        console.log('Processing alert ID:', alert.id);
        console.log('Current level:', alert.current_level);
        console.log('Rule ID:', alert.rule_id);

        if (!alert.rule_id) {
          console.log('Skipping alert — no rule_id');
          continue;
        }

        // Auto-close resolved alerts
        if (alert.status === 'RESOLVED') {
          alert.status = 'CLOSED';
          await alert.save();
          console.log(`Alert ${alert.id} closed`);
          continue;
        }

        // Fetch escalation policies
        const policies = await EscalationPolicy.findAll({
          where: { rule_id: alert.rule_id },
          order: [['level', 'ASC']]
        });

        console.log('Policies found:', policies.length);

        if (!policies.length) {
          console.log('No escalation policies configured');
          continue;
        }

        // Next escalation level
        const nextLevel = alert.current_level + 1;

        const nextPolicy = policies.find(
          p => p.level === nextLevel
        );

        console.log('Next level expected:', nextLevel);
        console.log('Next policy found:', nextPolicy ? 'YES' : 'NO');

        if (!nextPolicy) {
          console.log('No next escalation level. Skipping.');
          continue;
        }

        // Time check
        const referenceTime =
          alert.current_level === 0
            ? alert.first_triggered_at
            : alert.last_updated_at;

        const minutesElapsed =
          (now - referenceTime) / 60000;

        console.log('Minutes elapsed:', minutesElapsed);
        console.log('Escalate after minutes:', nextPolicy.escalate_after_minutes);

        // 🚨 ESCALATION CONDITION
        if (minutesElapsed >= nextPolicy.escalate_after_minutes) {
          // 🔒 Acquire lock to prevent duplicate escalations
          const lockKey = `escalation:${alert.id}:${nextLevel}`;
          const lock = await redis.set(
            lockKey,
            1,
            'NX',
            'EX',
            120
          );
          if (!lock) {
            console.log('⚠️ Escalation already triggered. Skipping.');
            continue;
          }

          console.log('🚨 Escalation condition met. Publishing event...');

          // ✅ Publish event instead of sending directly
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

          // Update alert escalation level
          alert.current_level = nextPolicy.level;
          alert.last_updated_at = now;
          await alert.save();

          console.log(`✅ Alert ${alert.id} escalated to level ${nextPolicy.level}`);

        } else {

          console.log('⏳ Escalation condition NOT met yet.');

        }

      } catch (alertError) {

        console.error(`❌ Error processing alert ${alert.id}:`, alertError.message);

      }
    }

  } catch (error) {

    console.error('❌ Scheduler failed:', error.message);

  }
});