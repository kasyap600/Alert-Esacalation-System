
const express = require('express');
const router = express.Router();
const Rule = require('../db/models/Rule');

router.post('/rules', async (req, res) => {
  try {
    const {
      deviceId,
      metricName,
      minValue,
      maxValue,
      durationMinutes,
      severity,
      enabled
    } = req.body;

    if (!deviceId || !metricName || minValue == null || maxValue == null) {
      return res.status(400).json({
        error: 'deviceId, metricName, minValue and maxValue are required'
      });
    }

    const rule = await Rule.create({
      device_id: deviceId,
      metric_name: metricName,
      min_value: minValue,
      max_value: maxValue,
      duration_minutes: durationMinutes || 0,
      severity: severity || 'HIGH',
      enabled: enabled !== false
    });

    res.status(201).json({
      message: 'Rule created successfully',
      rule
    });

  } catch (err) {
    console.error('RULE ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

