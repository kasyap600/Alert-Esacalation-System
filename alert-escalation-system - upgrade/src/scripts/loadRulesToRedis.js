const redis = require('../ingestion/redis');
const { Rule } = require('../db/models');

async function loadRules() {

  try {

    const rules = await Rule.findAll({
      where: { enabled: true }
    });

    for (const rule of rules) {

      const ruleData = {
        ruleId: rule.id,
        min: rule.min_value,
        max: rule.max_value,
        packet_threshold: rule.packet_threshold,
        severity: rule.severity
      };

      await redis.hset(
        `rules:${rule.device_id}`,
        rule.metric_name,
        JSON.stringify(ruleData)
      );

      console.log(
        `Loaded rule for device ${rule.device_id} metric ${rule.metric_name}`
      );
    }

    console.log("✅ All rules loaded to Redis");

  } catch (error) {

    console.error("Rule loader error:", error);
  }

  process.exit();
}

loadRules();