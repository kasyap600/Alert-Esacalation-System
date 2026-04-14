const express = require('express');
const router = express.Router();
const Alert = require('../db/models/Alert');
const alertService = require('./alert.service');

// GET all alerts
router.get('/', async (req, res) => {
  try {
    const alerts = await Alert.findAll();
    res.json(alerts);
  } catch (err) {
    console.error('DB ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET single alert
router.get('/:id', async (req, res) => {
  try {
    const alert = await Alert.findByPk(req.params.id);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    res.json(alert);
  } catch (err) {
    console.error('DB ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// UPDATE alert manually
router.put('/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const alert = await Alert.findByPk(req.params.id);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    alert.status = status;
    await alert.save();

    res.json(alert);
  } catch (err) {
    console.error('DB ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;