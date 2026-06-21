/**
 * Load test: 100 devices × 10 metrics each.
 *
 * What it does:
 *   1. SETUP   — registers 100 devices in the DB (skips if already exist).
 *   2. SEED    — creates 1 rule per device per metric (1000 rules total, skips existing).
 *   3. RUN     — every INTERVAL_MS, all 100 devices send one packet with 10 metrics.
 *                50% of packets are in normal range, 50% are violations (configurable).
 *   4. REPORT  — every REPORT_EVERY_MS prints live throughput, error rate, alert count.
 *   5. STOP    — after DURATION_MS (default 2 min) prints a final summary and exits.
 *
 * Usage:
 *   node src/loadtest/loadtest100.js
 *
 * Env vars:
 *   API_BASE_URL        http://localhost:5000
 *   ADMIN_API_KEY       set if ENFORCE_API_KEYS=true
 *   INGEST_API_KEY      set if ENFORCE_API_KEYS=true
 *   DEVICE_COUNT        number of devices          (default 100)
 *   INTERVAL_MS         ms between packet bursts   (default 2000)
 *   DURATION_MS         total test duration ms     (default 120000 = 2 min)
 *   VIOLATION_PCT       % of devices that violate  (default 50)
 *   REPORT_EVERY_MS     stats print interval ms    (default 10000)
 *   SKIP_SETUP          true = skip device/rule creation (default false)
 */

require('dotenv').config();
const axios = require('axios');

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE          = (process.env.API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const ADMIN_KEY     = process.env.ADMIN_API_KEY  || '';
const INGEST_KEY    = process.env.INGEST_API_KEY || '';
const DEVICE_COUNT  = Number(process.env.DEVICE_COUNT     || 100);
const INTERVAL_MS   = Number(process.env.INTERVAL_MS      || 2000);
const DURATION_MS   = Number(process.env.DURATION_MS      || 120_000);
const VIOLATION_PCT = Number(process.env.VIOLATION_PCT    || 50);
const REPORT_EVERY  = Number(process.env.REPORT_EVERY_MS  || 10_000);
const SKIP_SETUP    = process.env.SKIP_SETUP === 'true';

const adminH  = { 'Content-Type': 'application/json', ...(ADMIN_KEY  ? { 'x-api-key':    ADMIN_KEY  } : {}) };
const ingestH = { 'Content-Type': 'application/json', ...(INGEST_KEY ? { 'x-ingest-key': INGEST_KEY } : {}) };

const http = axios.create({ baseURL: BASE, timeout: 10_000 });

// ─── Metric definitions (10 metrics per device) ───────────────────────────────

const METRICS = [
  { name: 'temperature',  min: 10,  max: 80,  unit: '°C'  },
  { name: 'pressure',     min: 900, max: 1100, unit: 'hPa' },
  { name: 'humidity',     min: 20,  max: 90,  unit: '%'   },
  { name: 'vibration',    min: 0,   max: 50,  unit: 'mm/s'},
  { name: 'voltage',      min: 210, max: 250, unit: 'V'   },
  { name: 'current',      min: 0,   max: 15,  unit: 'A'   },
  { name: 'rpm',          min: 500, max: 3000, unit: 'rpm' },
  { name: 'co2',          min: 300, max: 1000, unit: 'ppm' },
  { name: 'noise',        min: 30,  max: 85,  unit: 'dB'  },
  { name: 'battery',      min: 20,  max: 100, unit: '%'   },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rand(min, max) {
  return Number((Math.random() * (max - min) + min).toFixed(2));
}

function safeValue(m)    { return rand(m.min + (m.max - m.min) * 0.1, m.max - (m.max - m.min) * 0.1); }
function violateValue(m) { return rand(m.max * 1.2 + 5, m.max * 1.5 + 10); }

function deviceId(i)  { return `loadtest-device-${String(i).padStart(3, '0')}`; }
function deviceName(i){ return `Load Test Device ${i}`; }

let _seq = 0;
function packetId(devId) { return `lt-${devId}-${Date.now()}-${++_seq}`; }

// ─── Stats ────────────────────────────────────────────────────────────────────

const stats = {
  sent: 0, ok: 0, err: 0,
  alertsAtStart: 0, alertsNow: 0,
  startMs: 0,
};

async function fetchAlertCount() {
  try {
    const { data } = await http.get('/api/alerts', { headers: adminH, params: { limit: 1, status: 'OPEN' } });
    return data?.pagination?.total ?? 0;
  } catch { return 0; }
}

function printStats(label = 'LIVE') {
  const elapsedS  = ((Date.now() - stats.startMs) / 1000).toFixed(1);
  const pps       = (stats.sent / Math.max(1, (Date.now() - stats.startMs) / 1000)).toFixed(1);
  const errPct    = stats.sent ? ((stats.err / stats.sent) * 100).toFixed(1) : '0.0';
  const newAlerts = stats.alertsNow - stats.alertsAtStart;
  console.log(
    `[${label}] elapsed=${elapsedS}s | packets sent=${stats.sent} ok=${stats.ok} err=${stats.err} (${errPct}%) | rate=${pps}/s | new OPEN alerts=${newAlerts}`
  );
}

// ─── Setup: register devices ──────────────────────────────────────────────────

async function setupDevices() {
  console.log(`\n[SETUP] Registering ${DEVICE_COUNT} devices...`);
  let created = 0, skipped = 0, failed = 0;

  const jobs = Array.from({ length: DEVICE_COUNT }, (_, i) => async () => {
    const id = i + 1;
    try {
      await http.post('/api/devices', {
        device_id: deviceId(id),
        name: deviceName(id),
        device_type: 'temperature_sensor',
        location: `Zone-${Math.ceil(id / 10)}`
      }, { headers: adminH });
      created++;
    } catch (e) {
      if (e?.response?.status === 409) { skipped++; }  // already exists
      else { failed++; console.error(`  device ${id} failed: ${e.message}`); }
    }
  });

  // Run 10 at a time so we don't hammer the API during setup
  for (let i = 0; i < jobs.length; i += 10) {
    await Promise.all(jobs.slice(i, i + 10).map(fn => fn()));
  }

  console.log(`  created=${created} already_existed=${skipped} failed=${failed}`);
}

// ─── Setup: create rules ──────────────────────────────────────────────────────

async function setupRules() {
  console.log(`\n[SETUP] Creating rules (${DEVICE_COUNT} devices × ${METRICS.length} metrics = ${DEVICE_COUNT * METRICS.length} rules)...`);
  let created = 0, skipped = 0, failed = 0;

  const jobs = [];
  for (let i = 1; i <= DEVICE_COUNT; i++) {
    for (const m of METRICS) {
      jobs.push(async () => {
        try {
          await http.post('/api/rules', {
            deviceId:        deviceId(i),
            metricName:      m.name,
            minValue:        m.min,
            maxValue:        m.max,
            packetThreshold: 3,
            durationMinutes: 0,
            severity:        'HIGH',
            triggerMode:     'PACKET_ONLY',
          }, { headers: adminH });
          created++;
        } catch (e) {
          // 409 = rule already exists for this device+metric (unique constraint)
          if (e?.response?.status === 409) { skipped++; }
          else { failed++; }
        }
      });
    }
  }

  // Run 20 at a time
  for (let i = 0; i < jobs.length; i += 20) {
    await Promise.all(jobs.slice(i, i + 20).map(fn => fn()));
    process.stdout.write(`\r  progress: ${Math.min(i + 20, jobs.length)}/${jobs.length}`);
  }

  console.log(`\n  created=${created} already_existed=${skipped} failed=${failed}`);
}

// ─── Run: send one burst of 100 packets ───────────────────────────────────────

async function sendBurst(violatingDevices) {
  const jobs = Array.from({ length: DEVICE_COUNT }, (_, i) => {
    const id      = i + 1;
    const devId   = deviceId(id);
    const violate = violatingDevices.has(id);

    const metrics = {};
    for (const m of METRICS) {
      metrics[m.name] = violate ? violateValue(m) : safeValue(m);
    }

    return http.post('/api/ingest', {
      deviceId:  devId,
      timestamp: Date.now(),
      packetId:  packetId(devId),
      metrics,
    }, { headers: ingestH })
    .then(() => { stats.ok++; })
    .catch(() => { stats.err++; });
  });

  stats.sent += DEVICE_COUNT;
  await Promise.all(jobs);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(65));
  console.log('Load Test: 100 devices × 10 metrics');
  console.log('═'.repeat(65));
  console.log(`API:           ${BASE}`);
  console.log(`Devices:       ${DEVICE_COUNT}`);
  console.log(`Metrics/device:${METRICS.length}`);
  console.log(`Burst interval:${INTERVAL_MS}ms`);
  console.log(`Duration:      ${DURATION_MS / 1000}s`);
  console.log(`Violation:     ${VIOLATION_PCT}% of devices per burst`);
  console.log(`Skip setup:    ${SKIP_SETUP}`);

  // 1. Setup
  if (!SKIP_SETUP) {
    await setupDevices();
    await setupRules();
  }

  // 2. Baseline alert count
  stats.alertsAtStart = await fetchAlertCount();
  console.log(`\n[RUN] Starting. Baseline OPEN alerts: ${stats.alertsAtStart}`);
  console.log(`      Each burst: ${DEVICE_COUNT} packets × ${METRICS.length} metrics = ${DEVICE_COUNT * METRICS.length} metric evaluations\n`);

  stats.startMs = Date.now();

  // 3. Burst loop
  const burstTimer = setInterval(async () => {
    // Randomly pick which devices violate this burst
    const violatingCount = Math.round(DEVICE_COUNT * VIOLATION_PCT / 100);
    const allIds = Array.from({ length: DEVICE_COUNT }, (_, i) => i + 1);
    // Shuffle and take first N
    for (let i = allIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allIds[i], allIds[j]] = [allIds[j], allIds[i]];
    }
    const violating = new Set(allIds.slice(0, violatingCount));
    await sendBurst(violating);
  }, INTERVAL_MS);

  // 4. Report timer
  const reportTimer = setInterval(async () => {
    stats.alertsNow = await fetchAlertCount();
    printStats('LIVE');
  }, REPORT_EVERY);

  // 5. Stop after DURATION_MS
  setTimeout(async () => {
    clearInterval(burstTimer);
    clearInterval(reportTimer);

    // Wait one extra interval for in-flight packets to be processed
    await new Promise(r => setTimeout(r, INTERVAL_MS + 2000));

    stats.alertsNow = await fetchAlertCount();

    console.log('\n' + '═'.repeat(65));
    console.log('FINAL SUMMARY');
    console.log('═'.repeat(65));
    printStats('FINAL');
    console.log(`Packets/burst: ${DEVICE_COUNT} devices × ${METRICS.length} metrics`);
    console.log(`Total bursts:  ~${Math.floor(DURATION_MS / INTERVAL_MS)}`);
    console.log(`Alerts opened: ${stats.alertsNow - stats.alertsAtStart} (OPEN)`);
    console.log('═'.repeat(65));
    process.exit(0);
  }, DURATION_MS);
}

main().catch(err => {
  console.error('Load test failed:', err.message);
  process.exit(1);
});
