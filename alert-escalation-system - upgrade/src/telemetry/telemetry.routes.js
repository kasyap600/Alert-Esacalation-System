const express = require('express');
const router = express.Router();
const { Telemetry } = require('../db/models');
const logger = require('../utils/logger');

// GET /api/telemetry?deviceId=&page=1&limit=25
router.get('/', async (req, res) => {
  try {
    const { deviceId, page = 1, limit = 25 } = req.query;
    const pageNum  = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 25));
    const offset   = (pageNum - 1) * limitNum;

    const where = {};
    if (deviceId) where.device_id = deviceId;

    const { count, rows } = await Telemetry.findAndCountAll({
      where,
      order: [['timestamp', 'DESC']],
      limit: limitNum,
      offset,
    });

    res.json({
      data: rows,
      pagination: { total: count, page: pageNum, limit: limitNum, pages: Math.ceil(count / limitNum) },
    });
  } catch (err) {
    logger.error('telemetry_list_failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch telemetry' });
  }
});

module.exports = router;
