const express = require('express');
const router = express.Router();
const Rule = require('../db/models/Rule');
const rulesService = require('../rules/rules.service');

router.post('/ingest', async (req, res) => {
  try {
    const { deviceId, metrics } = req.body;

    if (!deviceId || !metrics || typeof metrics !== 'object') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // 1️⃣ Fetch all enabled rules for this device in ONE query
    const rules = await Rule.findAll({
      where: {
        device_id: deviceId,
        enabled: true
      }
    });

    if (!rules || rules.length === 0) {
      return res.json({ message: 'No rules configured for this device' });
    }

    // 2️⃣ Convert rules to map: metric_name → rule
    const ruleMap = {};
    for (const rule of rules) {
      ruleMap[rule.metric_name] = rule;
    }

    // 3️⃣ Process each metric
    const tasks = Object.entries(metrics).map(
      async ([parameter, value]) => {
        const rule = ruleMap[parameter];
        if (!rule) return;

        await rulesService.processTelemetry(rule, value);
      }
    );

    await Promise.all(tasks);

    return res.json({
      message: 'Data processed successfully',
      processedMetrics: Object.keys(metrics)
    });

  } catch (error) {
    console.error('Ingestion error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;