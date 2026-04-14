const express = require('express');
const router = express.Router();

const {
  getAllDevices,
  createDevice,
  deleteDevice
} = require('./device.controller');

// GET
router.get('/', getAllDevices);

// POST
router.post('/', createDevice);

// DELETE
router.delete('/:id', deleteDevice);

module.exports = router;