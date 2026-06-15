require('dotenv').config();
const axios = require('axios');

const API_URL = process.env.LOADTEST_API_URL || 'http://localhost:5000/api/ingest';
const DEVICE_COUNT = Number(process.env.LOADTEST_DEVICE_COUNT || 1000);
const INTERVAL_MS = Number(process.env.LOADTEST_INTERVAL_MS || 10000);

function randomMetric(min, max) {
  return Number((Math.random() * (max - min) + min).toFixed(2));
}

function buildPayload(index) {
  return {
    deviceId: `device-${index}`,
    timestamp: Date.now(),
    metrics: {
      temperature: randomMetric(0, 100),
      pressure: randomMetric(0, 120),
      vibration: randomMetric(0, 60)
    }
  };
}

async function runIteration() {
  const jobs = [];
  for (let i = 1; i <= DEVICE_COUNT; i += 1) {
    jobs.push(
      axios.post(API_URL, buildPayload(i), {
        timeout: 4000,
        headers: process.env.INGEST_API_KEY
          ? { 'x-ingest-key': process.env.INGEST_API_KEY }
          : {}
      }).catch(() => null)
    );
  }
  const started = Date.now();
  await Promise.all(jobs);
  const elapsed = Date.now() - started;
  console.log(`[loadtest] sent=${DEVICE_COUNT} elapsedMs=${elapsed}`);
}

async function start() {
  console.log(`[loadtest] API_URL=${API_URL} devices=${DEVICE_COUNT} intervalMs=${INTERVAL_MS}`);
  while (true) {
    await runIteration();
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  }
}

start().catch((err) => {
  console.error('[loadtest] failed', err.message);
  process.exit(1);
});
