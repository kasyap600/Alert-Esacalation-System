/**
 * Automated end-to-end test runner.
 *
 * How it works:
 *   1. Fetches all rules you already created from the frontend.
 *   2. For each rule, runs three phases:
 *        NORMAL  — sends values safely inside the rule's range.
 *        VIOLATE — sends values clearly outside the range.
 *        RECOVER — sends values back inside the range.
 *   3. After each phase it polls the alerts API and checks the result.
 *   4. Prints a final pass/fail report.
 *
 * Usage:
 *   node src/scripts/autoTest.js
 *
 * Env vars (all optional — defaults work out of the box):
 *   API_BASE_URL          http://localhost:5000
 *   ADMIN_API_KEY         (only if ENFORCE_API_KEYS=true)
 *   INGEST_API_KEY        (only if ENFORCE_API_KEYS=true)
 *   TEST_PACKET_INTERVAL  ms between packets in each phase  (default 1500)
 *   TEST_POLL_INTERVAL    ms between alert poll attempts    (default 2000)
 *   TEST_POLL_TIMEOUT     ms to wait for alert to appear    (default 30000)
 *   TEST_ESCALATION       true = also wait for escalation   (default false)
 *   TEST_DEVICE_PREFIX    prefix for simulated device IDs   (default "test-sim")
 */

require('dotenv').config();
const axios = require('axios');

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE          = (process.env.API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const ADMIN_KEY     = process.env.ADMIN_API_KEY || '';
const INGEST_KEY    = process.env.INGEST_API_KEY || '';
const PKT_INTERVAL  = Number(process.env.TEST_PACKET_INTERVAL  || 1500);
const POLL_INTERVAL = Number(process.env.TEST_POLL_INTERVAL    || 2000);
const POLL_TIMEOUT  = Number(process.env.TEST_POLL_TIMEOUT     || 30000);
const TEST_ESC      = process.env.TEST_ESCALATION === 'true';

const adminHeaders  = ADMIN_KEY  ? { 'x-api-key':     ADMIN_KEY  } : {};
const ingestHeaders = INGEST_KEY ? { 'x-ingest-key':  INGEST_KEY } : {};

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

const http = axios.create({ baseURL: BASE, timeout: 10000 });

async function getRules() {
  const { data } = await http.get('/api/rules', { headers: adminHeaders });
  return Array.isArray(data) ? data : (data.data ?? []);
}

async function getAlerts(deviceId, metricName, status) {
  const { data } = await http.get('/api/alerts', {
    headers: adminHeaders,
    params: { status, limit: 100 }
  });
  const rows = Array.isArray(data) ? data : (data.data ?? []);
  return rows.filter(
    (a) => a.device_id === deviceId && a.metric_name === metricName
  );
}

let _pktSeq = 0;
async function sendPacket(deviceId, metricName, value) {
  _pktSeq++;
  await http.post('/api/ingest', {
    deviceId,
    timestamp: Date.now(),
    packetId:  `autotest-${deviceId}-${metricName}-${Date.now()}-${_pktSeq}`,
    metrics:   { [metricName]: value }
  }, { headers: { 'Content-Type': 'application/json', ...ingestHeaders } });
}

// ─── Polling helpers ──────────────────────────────────────────────────────────

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll until predicate returns a truthy value or timeout expires.
 * Returns the value returned by predicate, or null on timeout.
 */
async function pollUntil(predicate, timeoutMs, intervalMs, label) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    const result = await predicate();
    if (result) return result;
    process.stdout.write(`  ⏳  ${label} (attempt ${attempt})…\r`);
    await sleep(intervalMs);
  }
  process.stdout.write('\n');
  return null;
}

// ─── Phase runners ────────────────────────────────────────────────────────────

/**
 * Send `count` packets with `value`, spaced PKT_INTERVAL apart.
 */
async function sendPhase(deviceId, metricName, value, count, label) {
  log(`  → ${label}: sending ${count} packets with ${metricName}=${value}`);
  for (let i = 0; i < count; i++) {
    await sendPacket(deviceId, metricName, value);
    if (i < count - 1) await sleep(PKT_INTERVAL);
  }
}

// ─── Value generators ─────────────────────────────────────────────────────────

/** A value safely inside (min, max). */
function safeValue(min, max) {
  const mid = (min + max) / 2;
  return Number(mid.toFixed(4));
}

/** A value clearly above max — stays positive. */
function violateHigh(max) {
  return Number((max + Math.abs(max) * 0.5 + 10).toFixed(4));
}

// ─── Per-rule test ────────────────────────────────────────────────────────────

async function testRule(rule, index) {
  // Use the rule's own device_id — the rule-eval worker looks up rules by deviceId,
  // so packets sent for a different device would find no rules and never fire.
  const deviceId   = String(rule.device_id);
  const metricName = rule.metric_name;
  const min        = Number(rule.min_value);
  const max        = Number(rule.max_value);
  const threshold  = Number(rule.packet_threshold ?? 3);
  const ruleLabel  = `Rule #${rule.id} [${deviceId}] ${metricName} (${min}–${max})`;

  log(`\n${'─'.repeat(60)}`);
  log(`Testing: ${ruleLabel}`);
  log(`${'─'.repeat(60)}`);

  const results = {};

  // ── Phase 1: NORMAL ─────────────────────────────────────────────────────────
  log('\n[Phase 1] NORMAL — values inside range, no alert expected');
  await sendPhase(deviceId, metricName, safeValue(min, max), threshold + 1, 'Normal');

  await sleep(PKT_INTERVAL * 2);

  const normalAlerts = await getAlerts(deviceId, metricName, 'OPEN');
  if (normalAlerts.length === 0) {
    pass('No alert fired during normal values');
    results.normal = true;
  } else {
    fail(`Alert unexpectedly fired during normal values (id=${normalAlerts[0].id})`);
    results.normal = false;
  }

  // ── Phase 2: VIOLATE ────────────────────────────────────────────────────────
  log('\n[Phase 2] VIOLATE — values outside range, alert expected');
  const violationValue = violateHigh(max);
  await sendPhase(deviceId, metricName, violationValue, threshold + 1, 'Violation');

  log(`  ⏳  Waiting up to ${POLL_TIMEOUT / 1000}s for OPEN alert…`);
  const openAlert = await pollUntil(
    async () => {
      const found = await getAlerts(deviceId, metricName, 'OPEN');
      return found.length > 0 ? found[0] : null;
    },
    POLL_TIMEOUT,
    POLL_INTERVAL,
    'Waiting for OPEN alert'
  );

  if (openAlert) {
    pass(`Alert fired  id=${openAlert.id}  value=${openAlert.current_value}  severity=${openAlert.severity}`);
    results.alertFired = true;
    results.alertId    = openAlert.id;
  } else {
    fail('Alert did NOT fire within timeout');
    results.alertFired = false;
  }

  // ── Phase 3: ESCALATION (optional) ──────────────────────────────────────────
  if (TEST_ESC && results.alertFired) {
    log('\n[Phase 3] ESCALATION — keep violating, wait for level to increment');

    // Keep sending violations so the alert stays open
    const keepViolating = setInterval(async () => {
      await sendPacket(deviceId, metricName, violationValue).catch(() => {});
    }, PKT_INTERVAL);

    const escalationTimeoutMs = Math.max(POLL_TIMEOUT, 90000);
    log(`  ⏳  Waiting up to ${escalationTimeoutMs / 1000}s for current_level > 0…`);

    const escalatedAlert = await pollUntil(
      async () => {
        const rows = await getAlerts(deviceId, metricName, 'OPEN');
        const a = rows.find((r) => r.id === results.alertId);
        return a && a.current_level > 0 ? a : null;
      },
      escalationTimeoutMs,
      POLL_INTERVAL,
      'Waiting for escalation'
    );

    clearInterval(keepViolating);

    if (escalatedAlert) {
      pass(`Alert escalated  level=${escalatedAlert.current_level}`);
      results.escalated = true;
    } else {
      fail('Alert did NOT escalate within timeout (is an escalation policy configured for this rule?)');
      results.escalated = false;
    }
  }

  // ── Phase 4: RECOVER ────────────────────────────────────────────────────────
  if (results.alertFired) {
    log('\n[Phase 4] RECOVER — values back in range, auto-resolve expected');
    await sendPhase(deviceId, metricName, safeValue(min, max), threshold + 1, 'Recovery');

    log(`  ⏳  Waiting up to ${POLL_TIMEOUT / 1000}s for RESOLVED alert…`);
    const resolvedAlert = await pollUntil(
      async () => {
        const rows = await getAlerts(deviceId, metricName, 'RESOLVED');
        return rows.find((r) => r.id === results.alertId) || null;
      },
      POLL_TIMEOUT,
      POLL_INTERVAL,
      'Waiting for RESOLVED alert'
    );

    if (resolvedAlert) {
      pass(`Alert auto-resolved  id=${resolvedAlert.id}`);
      results.resolved = true;
    } else {
      fail('Alert did NOT auto-resolve within timeout');
      results.resolved = false;
    }
  }

  return { rule: ruleLabel, ...results };
}

// ─── Report ───────────────────────────────────────────────────────────────────

function log(msg)  { console.log(msg); }
function pass(msg) { console.log(`  ✅  ${msg}`); }
function fail(msg) { console.error(`  ❌  ${msg}`); }

function printReport(results) {
  log(`\n${'═'.repeat(60)}`);
  log('FINAL REPORT');
  log('═'.repeat(60));

  let totalChecks = 0, passedChecks = 0;

  for (const r of results) {
    log(`\n${r.rule}`);
    const checks = [
      ['Normal — no false positive',  r.normal],
      ['Violation — alert fired',     r.alertFired],
      ...(TEST_ESC ? [['Escalation — level incremented', r.escalated]] : []),
      ['Recovery — auto-resolved',    r.resolved],
    ];
    for (const [label, ok] of checks) {
      if (ok === undefined) continue;
      totalChecks++;
      if (ok) passedChecks++;
      log(`  ${ok ? '✅' : '❌'}  ${label}`);
    }
  }

  log(`\n${'─'.repeat(60)}`);
  log(`Result: ${passedChecks}/${totalChecks} checks passed`);
  if (passedChecks === totalChecks) {
    log('ALL TESTS PASSED 🎉');
  } else {
    log(`${totalChecks - passedChecks} check(s) FAILED`);
  }
  log('═'.repeat(60));

  return passedChecks === totalChecks;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('═'.repeat(60));
  log('Alert Escalation System — Automated E2E Test');
  log('═'.repeat(60));
  log(`API:            ${BASE}`);
  log(`Auth enforced:  ${!!ADMIN_KEY}`);
  log(`Packet interval:${PKT_INTERVAL}ms`);
  log(`Poll timeout:   ${POLL_TIMEOUT}ms`);
  log(`Test escalation:${TEST_ESC}`);

  // 1. Fetch rules created from the frontend
  log('\n[Setup] Fetching rules from API…');
  let rules;
  try {
    rules = await getRules();
  } catch (err) {
    console.error(`\nFailed to reach API at ${BASE}: ${err.message}`);
    console.error('Make sure the backend is running (npm run local:stack:full)');
    process.exit(1);
  }

  if (!rules.length) {
    console.error('\nNo rules found. Create at least one rule from the frontend dashboard, then re-run this script.');
    process.exit(1);
  }

  const enabledRules = rules.filter((r) => r.enabled !== false);
  log(`Found ${rules.length} rule(s), ${enabledRules.length} enabled. Testing all enabled rules.\n`);
  enabledRules.forEach((r, i) =>
    log(`  ${i + 1}. Rule #${r.id}  device=${r.device_id}  metric=${r.metric_name}  range=[${r.min_value}, ${r.max_value}]  threshold=${r.packet_threshold}`)
  );

  // 2. Run each rule through the test phases sequentially
  const allResults = [];
  for (let i = 0; i < enabledRules.length; i++) {
    const result = await testRule(enabledRules[i], i + 1);
    allResults.push(result);
  }

  // 3. Print report and exit with appropriate code
  const allPassed = printReport(allResults);
  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('\nUnhandled error:', err.message);
  process.exit(1);
});
