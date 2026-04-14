const { evaluate } = require('../rules/rules.service');

/**
 * Random number generator
 */
function randomValue(min = 1, max = 100) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate ALL metrics (real device payload)
 */
function generateMetrics() {
  return {
    // 🔥 ENABLED METRICS (force violations sometimes)
    temperature: randomValue(0, 100)  ,
    pressure: randomValue(1, 100),
    vibration: 30,
    humidity: randomValue(1, 100),

    // ❌ DISABLED METRICS (random → should be ignored)
    voltage: randomValue(100, 700),
    current: randomValue(1, 20),
    rpm: randomValue(1, 20),
    speed: randomValue(1, 20),
    torque: randomValue(1, 100),
    velocity: randomValue(1, 100),
    vely: randomValue(1, 100)
  };
}

/**
 * Generate packetId (same for a short window → simulates duplicates)
 */
function generatePacketId(deviceId) {
  // Same ID for 5 seconds → simulates retries
  return `${deviceId}-${Math.floor(Date.now() / 5000)}`;
}

/**
 * Start simulator
 */
function startDeviceSimulator(deviceIds = []) {

  console.log(`🚀 Starting simulator for devices: ${deviceIds.join(", ")}`);

  setInterval(async () => {

    for (const deviceId of deviceIds) {

      const metrics = generateMetrics();

      const packet = {
        packetId: generatePacketId(deviceId), // ✅ important
        deviceId,
        metrics,
        timestamp: Date.now()
      };

      console.log(`📦 Device ${deviceId} Packet:`, packet);

      try {
        // 🔥 Send SAME packet twice → simulate retry/duplicate
        await evaluate(packet);
        //await evaluate(packet);

      } catch (err) {
        console.error(`Simulator error for device ${deviceId}:`, err);
      }
    }

  }, 5000); // every 5 seconds
}

module.exports = { startDeviceSimulator };