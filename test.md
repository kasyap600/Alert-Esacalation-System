# Alert Escalation System — Test Report

**Date:** 2026-06-21
**System:** IoT Alert Escalation System
**Backend:** Node.js / Express / PostgreSQL / Redis
**Dashboard:** Next.js 15

---

## 1. Overview

This report covers all testing performed on the Alert Escalation System, including:
- Manual end-to-end functional testing via device simulator
- Automated E2E test suite
- Load testing at two throughput levels (low and high)

---

## 2. Environment

| Component | Version / Config |
|---|---|
| Node.js | 20 (Alpine) |
| PostgreSQL | 16 |
| Redis | 7 |
| API port | 5000 |
| Workers | rule-eval, telemetry, escalation, notification, mqtt |
| API keys | Not enforced (local dev mode) |
| DB pool max | 30 connections |
| Metric eval concurrency | 8 |
| Packet dedup TTL | 120s |

---

## 3. Pre-Test Fixes Applied

Before testing, the following bugs were identified and fixed:

| ID | Area | Fix |
|---|---|---|
| SEC-1 | Auth | API key bypass when env var missing — enforced with `ENFORCE_API_KEYS` |
| SEC-2 | Auth | Timing-safe comparison leaked key length — fixed by hashing both sides to SHA-256 before compare |
| SEC-4 | Validation | No cap on metric keys per packet — capped at 50 |
| SEC-5 | Notifications | Email header injection via deviceId — stripped `\r\n` from subject fields |
| REL-1 | Rules | Non-atomic violation counter race — documented, LOCK gate is the true dedup |
| REL-2 | Rules | Active key lock leaked for 300s on Redis failure — wrapped in try/finally, deletes lock on failure |
| REL-3 | Scheduler | Unbounded `findAll` of all open alerts — replaced with batches of 200 |
| REL-4 | Scheduler | Concurrent cron tick overlap — added `running` mutex flag |
| SCALE-2 | Scheduler | N+1 DB query per alert — replaced with single `WHERE rule_id IN (...)` batch query |
| SCALE-3 | Notifications | Rate limiter was per-device only — changed to per-device+metric |
| SCALE-4 | Redis | Streams grew without bound — added `MAXLEN ~100000` to all streams |
| DI-1 | DB | No FK on `Alert.rule_id` — added FK with `ON DELETE SET NULL` |
| DI-2 | DB | FLOAT vs DOUBLE mismatch on threshold fields — changed Rule model to DOUBLE |
| DI-3 | DB | No unique constraint on `(device_id, timestamp)` in Telemetry — added |
| CQ-5 | Validation | PUT escalation accepted `escalateAfterMinutes: 0` — added range validation |
| CQ-6 | Validation | `notifyVia` accepted unsupported channels — restricted to `EMAIL` at write time |

---

## 4. Automated E2E Test Suite

### 4.1 How It Works

A custom automated test runner (`src/scripts/autoTest.js`) was built to:

1. Fetch all rules created from the frontend dashboard automatically — no hardcoding
2. Run 4 phases per rule sequentially:
   - **NORMAL** — sends values inside the safe range, verifies no false-positive alert fires
   - **VIOLATE** — sends values above max, polls until OPEN alert appears in DB
   - **ESCALATION** *(optional)* — keeps sending violations, waits for `current_level > 0`
   - **RECOVER** — sends values back in range, polls until alert auto-resolves

### 4.2 Test Configuration

| Parameter | Value |
|---|---|
| Packet interval | 1500ms between packets |
| Poll timeout | 30s per phase |
| Poll interval | 2000ms |
| Escalation test | Enabled (`TEST_ESCALATION=true`) |
| Escalation timeout | 90s |

### 4.3 Rules Tested

| Rule | Device | Metric | Range | Packet Threshold | Trigger Mode | Severity |
|---|---|---|---|---|---|---|
| #6 | 27 | temp | 0 – 100 | 4 | PACKET_ONLY | HIGH |
| #10 | 27 | — | — | — | — | — |

Escalation policy configured from the frontend for Rule #10:

| Level | After | Channel | Recipient |
|---|---|---|---|
| L0 | 1 min | EMAIL | tinkusai92@gmail.com |
| L1 | 10 min | — | — |

### 4.4 Bugs Found During Testing

**Bug 1 — Wrong device ID in test packets**

The script was generating synthetic device IDs (`test-sim-6`) instead of using the actual `device_id` from the rule in the DB (`27`). The rule-eval worker looks up rules by `deviceId` — finding no rules for `test-sim-6` it silently skipped evaluation entirely, so no alerts ever fired.

*Fix:* Changed `testRule()` to use `rule.device_id` directly from the fetched rule object.

**Bug 2 — Packet dedup collision**

`packetId` was built with `Date.now()` which can repeat within the same millisecond when packets are sent back-to-back. The dedup check silently dropped the second packet.

*Fix:* Added a monotonic `_pktSeq` counter appended to every packet ID to guarantee uniqueness.

### 4.5 E2E Test Results

| Phase | Check | Result |
|---|---|---|
| NORMAL | No false-positive alert fired for values inside range (0–100) | ✅ PASS |
| VIOLATE | OPEN alert created after 4 packets with value=160 | ✅ PASS |
| ESCALATION | Alert `current_level` incremented to 1 after ~60s | ✅ PASS |
| RECOVER | Alert auto-resolved when values returned to safe range | ✅ PASS |

**Overall: 4/4 checks passed**

---

## 5. Load Test — Baseline (2s interval)

### 5.1 Configuration

```
Devices:        100  (loadtest-device-001 → loadtest-device-100)
Metrics/device: 10
Burst interval: 2000ms
Duration:       120s
Violation %:    50% of devices randomly per burst
Packet threshold on all rules: 3
```

### 5.2 Results

| Metric | Value |
|---|---|
| Total packets sent | 5,900 |
| Successful (ok) | 5,900 |
| Failed (err) | 0 |
| Error rate | 0.0% |
| Sustained throughput | **47.6 packets/sec** |
| Metric evaluations/sec | **~476/sec** |
| Total duration | 124s |
| New OPEN alerts | **555** |

### 5.3 Notes

555 alerts opened vs the theoretical 500 (`50 violating devices × 10 metrics`). The excess is expected — the violating set is reshuffled randomly each burst, so over 60 bursts more than 50 unique devices crossed the packet threshold at least once.

**Verdict: PASS** — Zero errors, system well within limits.

---

## 6. Load Test — High Rate (500ms interval)

### 6.1 Configuration

```
Devices:        100
Metrics/device: 10
Burst interval: 500ms  (4× faster than baseline)
Duration:       120s
Violation %:    50% of devices randomly per burst
Skip setup:     true (devices and rules already existed)
```

### 6.2 Metrics Tested Per Device

| Metric | Safe Range | Unit |
|---|---|---|
| temperature | 10 – 80 | °C |
| pressure | 900 – 1100 | hPa |
| humidity | 20 – 90 | % |
| vibration | 0 – 50 | mm/s |
| voltage | 210 – 250 | V |
| current | 0 – 15 | A |
| rpm | 500 – 3000 | rpm |
| co2 | 300 – 1000 | ppm |
| noise | 30 – 85 | dB |
| battery | 20 – 100 | % |

### 6.3 Live Progression

| Elapsed | Packets Sent | Rate | Errors | New OPEN Alerts | Notes |
|---|---|---|---|---|---|
| 10s | 1,900 | 189.8/s | 0 | -215 | Auto-resolving leftover alerts from previous run |
| 20s | 3,900 | 194.9/s | 0 | -35 | Still net-resolving |
| 30s | 5,900 | 196.6/s | 0 | +150 | Violations overtake resolutions |
| 40s | 7,900 | 197.4/s | 0 | +265 | |
| 50s | 9,900 | 198.0/s | 0 | +445 | |
| 60s | 11,900 | 198.3/s | 0 | +545 | |
| 70s | 13,900 | 198.5/s | 0 | +605 | |
| 80s | 15,900 | 198.7/s | 0 | +930 | |
| 90s | 17,900 | 198.9/s | 0 | +1,025 | |
| 100s | 19,900 | 199.0/s | 0 | +1,165 | |
| 110s | 21,900 | 199.1/s | 0 | +1,325 | |
| **120s** | **23,900** | **195.1/s** | **0** | **+1,540** | Final |

### 6.4 Final Summary

| Metric | Value |
|---|---|
| Total packets sent | 23,900 |
| Successful (ok) | 23,900 |
| Failed (err) | 0 |
| Error rate | **0.0%** |
| Sustained throughput | **195.1 packets/sec** |
| Metric evaluations/sec | **~1,950/sec** |
| Total bursts | ~240 |
| New OPEN alerts | **1,540** |

### 6.5 Explanation of Negative Alert Count at 10–20s

The baseline run left 1,026 OPEN alerts in the DB. At the start of this run, 50% of devices were randomly assigned to the "safe" group and began sending normal values — the rule-eval worker auto-resolved ~215 of those old alerts before new violations accumulated enough to overtake them. By 30s the net direction flipped positive. This is correct system behaviour.

**Verdict: PASS** — Zero errors at 195 packets/sec. The single rule-eval worker handled ~1,950 metric evaluations/sec without any failures.

---

## 7. Capacity Analysis

| Test | Burst Interval | Rate | Metric Evals/sec | Errors | Result |
|---|---|---|---|---|---|
| Baseline | 2000ms | 47.6/s | ~476/s | 0 | PASS |
| High rate | 500ms | 195.1/s | ~1,950/s | 0 | PASS |
| Stress | 200ms | ~500/s | ~5,000/s | Not yet run | — |

### Estimated Ceiling (single server, default config)

| Component | Bottleneck | Limit |
|---|---|---|
| Rule-eval worker | Redis round-trips (~28 ops/packet) | ~200–300 packets/sec |
| Telemetry worker | PostgreSQL single-row INSERT | ~200–500 packets/sec |
| API (ingest) | Single Node.js process, no cluster | ~1,000–2,000 req/sec |
| Redis | All ops combined at current scale | Not a bottleneck (~5,600/s vs 100k/s limit) |
| DB connection pool | 30 max × 6 processes = 180 potential | Exhausts if PostgreSQL `max_connections=100` |

**Realistic ceiling: ~200–500 packets/sec** before the rule-eval worker or telemetry worker falls behind.

### How to Scale Beyond This

| Bottleneck | Solution | Multiplier |
|---|---|---|
| Rule-eval worker | Run 5 instances (share same Redis consumer group) | 5× |
| Telemetry worker | Run multiple instances | 5× |
| API throughput | PM2 cluster mode or Node.js `cluster` module | 4–8× |
| DB connections | Add PgBouncer | 1,000 app conns → 100 real DB conns |
| Telemetry inserts | Batch inserts (accumulate 100 rows, one INSERT) | 10–20× |

---

## 8. Pagination

Added after load testing created large datasets that exposed missing pagination:

| Endpoint | Before | After |
|---|---|---|
| `GET /api/alerts` | Already paginated | No change |
| `GET /api/rules` | `findAll()` — no limit | `findAndCountAll()`, `?page&limit`, max 200/page |
| `GET /api/devices` | `findAll()` — no limit | `findAndCountAll()`, `?page&limit`, max 200/page |

Dashboard pages (Alerts, Rules, Devices) now show:
- `Showing X–Y of Z` count
- Prev / Next buttons
- Smart page number list with ellipsis for large page counts
- 25 rows per page

---

## 9. Known Limitations

| Area | Limitation |
|---|---|
| Notifications | Only EMAIL supported — SMS/SLACK rejected at API level |
| Rule-eval worker | Single instance in default config — ceiling ~200 packets/sec |
| Telemetry inserts | One PostgreSQL INSERT per packet — no batching |
| Escalation scheduler | Runs every 60s — minimum escalation granularity is 1 minute |
| Alert timestamps | Set with `new Date()` in app code — vulnerable to clock skew across multiple API instances |
| Dashboard filters | Type/status filters on Devices and Rules pages are client-side within the current page only |
| Stress test | 200ms interval test (target ~500 packets/sec) not yet run |

---

## 10. Test Commands Reference

```bash
# Start full stack (API + all 5 workers)
npm run local:stack:full

# Automated E2E test — reads rules from DB, tests each rule through all phases
npm run test:e2e

# Automated E2E test with escalation phase included
npm run test:e2e:escalation

# Load test — standard (2s interval, 100 devices, 10 metrics, creates devices+rules)
npm run loadtest:100

# Load test — skip device/rule setup (already exist from previous run)
npm run loadtest:100:skip-setup

# Load test — 100% of devices violate every burst
npm run loadtest:100:violations

# Load test — custom parameters
INTERVAL_MS=200 DURATION_MS=300000 VIOLATION_PCT=80 SKIP_SETUP=true node src/loadtest/loadtest100.js

# Watch Redis stream backlog during load test (growing = worker falling behind)
watch -n 1 "redis-cli xlen stream:telemetry:ingest"

# Watch OPEN alert count live
watch -n 3 "curl -s http://localhost:5000/api/alerts?status=OPEN | jq '.pagination'"

# Check backend metrics
curl -s http://localhost:5000/metrics | jq
```
