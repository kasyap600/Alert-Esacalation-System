require('dotenv').config();
const { startDeviceSimulator } = require('./deviceSimulator');

const ids = (process.env.SIM_DEVICE_IDS || '28')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

startDeviceSimulator(ids, {
  mode: process.env.SIM_MODE || 'http',
  intervalMs: Number(process.env.SIM_INTERVAL_MS || 5000),
  apiBaseUrl: process.env.API_BASE_URL,
  ingestKey: process.env.INGEST_API_KEY
});
