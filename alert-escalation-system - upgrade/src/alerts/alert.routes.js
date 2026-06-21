const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const Alert = require('../db/models/Alert');
const alertService = require('./alert.service');
const logger = require('../utils/logger');

const VALID_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'RESOLVED'];

// GET /api/alerts  — paginated, filterable by status
router.get('/', async (req, res) => {
  try {
    const { status, page = 1, limit = 100 } = req.query;
    const where = {};
    if (status) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      where.status = status;
    }
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(500, Math.max(1, parseInt(limit, 10) || 100));
    const offset = (pageNum - 1) * limitNum;

    const { count, rows } = await Alert.findAndCountAll({
      where,
      order: [['triggered_at', 'DESC']],
      limit: limitNum,
      offset
    });

    res.json({
      data: rows,
      pagination: { total: count, page: pageNum, limit: limitNum, pages: Math.ceil(count / limitNum) }
    });
  } catch (err) {
    logger.error('alerts_list_failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// GET /api/alerts/:id
router.get('/:id', async (req, res) => {
  try {
    const alert = await Alert.findByPk(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    res.json(alert);
  } catch (err) {
    logger.error('alert_get_failed', { error: err.message });
    res.status(500).json({ error: 'Failed to fetch alert' });
  }
});

// PUT /api/alerts/:id  — update status with validation
router.put('/:id', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    const alert = await Alert.findByPk(req.params.id);
    if (!alert) return res.status(404).json({ error: 'Alert not found' });

    if (status === 'ACKNOWLEDGED') {
      const rawAcknowledgedBy = req.body.acknowledgedBy;
      const acknowledgedBy = rawAcknowledgedBy
        ? String(rawAcknowledgedBy).slice(0, 100)
        : null;
      await alertService.acknowledgeAlert(alert.id, acknowledgedBy);
    } else if (status === 'RESOLVED') {
      await alertService.resolveAlert(alert.id);
    } else {
      alert.status = status;
      alert.last_updated_at = new Date();
      await alert.save();
    }

    const updated = await Alert.findByPk(alert.id);
    res.json(updated);
  } catch (err) {
    logger.error('alert_update_failed', { error: err.message });
    res.status(500).json({ error: 'Failed to update alert' });
  }
});

module.exports = router;
