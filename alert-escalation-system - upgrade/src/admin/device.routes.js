const express = require('express');
const router = express.Router();
const Device = require('../db/models/Device');
const logger = require('../utils/logger');

router.post('/devices', async (req, res) => {
  try {
    const { deviceId, name, location, deviceType } = req.body;

    // ✅ Basic validation
    if (!deviceId || !name) {
      return res.status(400).json({
        error: 'deviceId and name are required'
      });
    }

    // ✅ Check if device already exists
    const existingDevice = await Device.findOne({
      where: { device_id: deviceId }
    });

    if (existingDevice) {
      return res.status(409).json({
        error: 'Device already exists'
      });
    }

    // ✅ Create device
    const device = await Device.create({
      device_id: deviceId,
      name,
      location: location || null,
      device_type: deviceType || null
    });

    return res.status(201).json({
      message: 'Device created successfully',
      device
    });

  } catch (err) {
    logger.error('admin_device_create_failed', { error: err.message });
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;