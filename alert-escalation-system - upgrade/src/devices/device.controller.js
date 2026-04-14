const { Device } = require('../db/models');

// ✅ GET all devices
async function getAllDevices(req, res) {
  try {
    const devices = await Device.findAll({
      order: [['device_id', 'ASC']]
    });

    res.json(devices);
  } catch (err) {
    console.error('Error fetching devices:', err);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
}

// ✅ CREATE device
async function createDevice(req, res) {
  try {
    const { device_id, name, location, device_type } = req.body;

    if (!device_id || !name) {
      return res.status(400).json({ error: 'device_id and name required' });
    }

    const device = await Device.create({
      device_id,
      name,
      location,
      device_type,
      is_active: true
    });

    res.status(201).json(device);
  } catch (err) {
    console.error('Error creating device:', err);
    res.status(500).json({ error: 'Failed to create device' });
  }
}

// ✅ DELETE device
async function deleteDevice(req, res) {
  try {
    const { id } = req.params;

    const deleted = await Device.destroy({
      where: { device_id: id }
    });

    if (!deleted) {
      return res.status(404).json({ error: 'Device not found' });
    }

    res.json({ message: 'Device deleted successfully' });
  } catch (err) {
    console.error('Error deleting device:', err);
    res.status(500).json({ error: 'Failed to delete device' });
  }
}

module.exports = {
  getAllDevices,
  createDevice,
  deleteDevice
};