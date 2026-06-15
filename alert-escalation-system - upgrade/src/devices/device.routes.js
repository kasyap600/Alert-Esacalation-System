const express = require('express');
const router = express.Router();

const {
  getAllDevices,
  createDevice,
  updateDevice,
  toggleDevice,
  deleteDevice
} = require('./device.controller');

// GET
router.get('/', getAllDevices);

// POST
router.post('/', createDevice);

// PUT update
router.put('/:id', updateDevice);

// PATCH toggle active
router.patch('/:id/toggle', toggleDevice);

// DELETE
router.delete('/:id', deleteDevice);

module.exports = router;