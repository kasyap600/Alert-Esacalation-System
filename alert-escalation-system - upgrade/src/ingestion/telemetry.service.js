const { Telemetry } = require('../db/models');

async function storeTelemetry(packet) {
  const { deviceId, timestamp, metrics } = packet;
  await Telemetry.create({
    device_id: deviceId,
    timestamp,
    metrics
  });
}

module.exports = {
  storeTelemetry
};