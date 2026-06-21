const crypto = require('crypto');
const { Device } = require('../db/models');

// ✅ GET all devices (paginated)
async function getAllDevices(req, res) {
  try {
    const { page = 1, limit = 50 } = req.query;
    const pageNum  = Math.max(1, parseInt(page, 10)  || 1);
    const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
    const offset   = (pageNum - 1) * limitNum;

    const { count, rows } = await Device.findAndCountAll({
      order: [['device_id', 'ASC']],
      limit: limitNum,
      offset
    });

    res.json({
      data: rows,
      pagination: { total: count, page: pageNum, limit: limitNum, pages: Math.ceil(count / limitNum) }
    });
  } catch (err) {
    console.error('Error fetching devices:', err);
    res.status(500).json({ error: 'Failed to fetch devices' });
  }
}

// ✅ CREATE device
// If device_id is omitted, insert with a temporary unique value, then set device_id to String(id)
// so the public id matches the auto-increment PK (string form).
async function createDevice(req, res) {
  try {
    const { device_id, name, location, device_type } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'name required' });
    }

    const hasCustomId =
      device_id !== undefined &&
      device_id !== null &&
      String(device_id).trim() !== '';

    if (hasCustomId) {
      const device = await Device.create({
        device_id: String(device_id).trim(),
        name,
        location,
        device_type,
        is_active: true
      });
      return res.status(201).json(device);
    }

    const tempKey = `__tmp_${crypto.randomUUID()}`;
    const device = await Device.create({
      device_id: tempKey,
      name,
      location,
      device_type,
      is_active: true
    });

    await device.update({ device_id: `device-${device.id}` });
    await device.reload();

    return res.status(201).json(device);
  } catch (err) {
    console.error('Error creating device:', err);
    res.status(500).json({ error: 'Failed to create device' });
  }
}

// ✅ UPDATE device (does not change device_id)
async function updateDevice(req, res) {
  try {
    const { id } = req.params;
    const { name, location, device_type, is_active } = req.body;

    const device = await Device.findOne({
      where: { device_id: id }
    });

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    if (name !== undefined) device.name = name;
    if (location !== undefined) device.location = location;
    if (device_type !== undefined) device.device_type = device_type;
    if (is_active !== undefined) device.is_active = Boolean(is_active);

    await device.save();
    res.json(device);
  } catch (err) {
    console.error('Error updating device:', err);
    res.status(500).json({ error: 'Failed to update device' });
  }
}

// ✅ Toggle active flag
async function toggleDevice(req, res) {
  try {
    const { id } = req.params;

    const device = await Device.findOne({
      where: { device_id: id }
    });

    if (!device) {
      return res.status(404).json({ error: 'Device not found' });
    }

    device.is_active = !device.is_active;
    await device.save();
    res.json(device);
  } catch (err) {
    console.error('Error toggling device:', err);
    res.status(500).json({ error: 'Failed to toggle device' });
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
  updateDevice,
  toggleDevice,
  deleteDevice
};