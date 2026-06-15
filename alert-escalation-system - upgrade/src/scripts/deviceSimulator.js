const axios = require('axios');
const { evaluate } = require('../rules/rules.service');

function randomValue(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function metrics(forceViolation) {
  return {
    temperature: forceViolation ? 200 : randomValue(0, 100),
    pressure: forceViolation ? 200 : randomValue(1, 100),
    vibration: 30,
    humidity: randomValue(1, 100),
    voltage: randomValue(100, 700),
    current: randomValue(1, 20),
    rpm: randomValue(1, 20),
    speed: randomValue(1, 20),
    torque: randomValue(1, 100),
    velocity: randomValue(1, 100),
    vely: randomValue(1, 100)
  };
}

function packet(deviceId) {
  const force = process.env.SIM_FORCE_VIOLATION === 'true';
  return {
    packetId: `${deviceId}-${Math.floor(Date.now() / 5000)}`,
    deviceId: String(deviceId),
    metrics: metrics(force),
    timestamp: Date.now()
  };
}

async function sendHttp(p, baseUrl, ingestKey) {
  const url = `${String(baseUrl).replace(/\/$/, '')}/api/ingest`;
  const headers = { 'Content-Type': 'application/json' };
  if (ingestKey) headers['x-ingest-key'] = ingestKey;
  const res = await axios.post(url, p, { headers, timeout: 15000 });
  return res.data;
}

function startDeviceSimulator(deviceIds, opts = {}) {
  const mode = opts.mode || process.env.SIM_MODE || 'http';
  const ms = Number(opts.intervalMs || process.env.SIM_INTERVAL_MS || 5000);
  const base = opts.apiBaseUrl || process.env.API_BASE_URL || 'http://localhost:5000';
  const key = opts.ingestKey ?? process.env.INGEST_API_KEY;

  const tick = async () => {
    for (const id of deviceIds) {
      const p = packet(id);
      try {
        if (mode === 'direct') {
          await evaluate(p);
        } else {
          await sendHttp(p, base, key);
        }
      } catch (e) {
        console.error('simulator', id, e.message);
      }
    }
  };

  tick();
  return setInterval(tick, ms);
}

module.exports = { startDeviceSimulator, packet };
