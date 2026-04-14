const { Telemetry } = require('../db/models');

async function storeTelemetry(packet) {
  try {
    const { deviceId, timestamp, metrics } = packet;

    await Telemetry.create({
      device_id: deviceId,
      timestamp,
      metrics
    });

  } catch (err) {
    console.error('Telemetry DB insert error:', err);
  }
}

module.exports = {
  storeTelemetry
};