const redis = require('./redis');
const { storeTelemetry } = require('./telemetry.service');

async function telemetryWorker() {
  console.log('🚀 Telemetry worker started...');

  while (true) {
    try {
      const result = await redis.brpop('telemetryQueue', 0);

      if (result) {
        const data = JSON.parse(result[1]);
        await storeTelemetry(data);
      }

    } catch (err) {
      console.error('Worker error:', err);
    }
  }
}

module.exports = telemetryWorker;