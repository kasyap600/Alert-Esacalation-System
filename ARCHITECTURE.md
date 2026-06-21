# Architecture

This document describes the internal design of the IoT Alert Escalation System — how data moves from a sensor packet to a fired alert to an escalation email.

---

## System Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Factory Floor                                 │
│   [Sensor A]   [Sensor B]   [PLC C]   [ESP32 D]                     │
└────────────────────────┬─────────────────────────────────────────────┘
                         │  POST /api/ingest  (HTTP/HTTPS)
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     API Server  (Express — port 5000)                │
│   • Validates payload                                                │
│   • Deduplicates packetId (Redis SET NX, TTL = PACKET_DEDUPE_TTL_SECONDS, default 120s)
│   • Writes to two Redis streams in one pipeline                      │
└───────────────────────┬──────────────────────────────────────────────┘
                        │
          ┌─────────────┴──────────────┐
          │                            │
          ▼                            ▼
  stream:telemetry:ingest      stream:telemetry:persist
  (rule evaluation queue)      (database write queue)
          │                            │
          ▼                            ▼
  ┌──────────────┐            ┌─────────────────┐
  │ rule-eval    │            │ telemetry        │
  │ worker       │            │ worker           │
  └──────┬───────┘            └────────┬─────────┘
         │                            │
         │ fires alerts               │ inserts rows
         ▼                            ▼
  ┌─────────────────────────────────────────────────────┐
  │                    PostgreSQL                        │
  │   alerts  rules  devices  telemetry_data             │
  │   escalation_policies                               │
  └──────────────────────────────┬──────────────────────┘
                                 │
           ┌─────────────────────┘
           │ (cron every 60s)
           ▼
  ┌──────────────────┐     stream:alert:notifications
  │ escalation       │────────────────────────────────▶
  │ scheduler        │                                  ┌────────────────┐
  └──────────────────┘                                  │ notification   │
                                                        │ worker         │──▶ SMTP Email
                                                        └────────────────┘

  ┌──────────────┐
  │ MQTT worker  │──▶ POST /api/ingest (internal)   ← optional, for MQTT-native sensors
  │ (optional)   │
  └──────────────┘

  ┌──────────────────────────────────────────────────────┐
  │                   Dashboard (Next.js 15)              │
  │   /api/* proxied to Express                          │
  │   Pages: Dashboard · Devices · Rules · Alerts        │
  │          Escalation · Analytics                      │
  └──────────────────────────────────────────────────────┘
```

---

## Request Lifecycle: One Sensor Packet

1. **Sensor** sends `POST /api/ingest` with `{ deviceId, metrics, timestamp?, packetId? }`.

2. **Auth middleware** checks `x-ingest-key` header. Returns 401 if missing/wrong.

3. **Validator** (`validateTelemetryPayload`) checks:
   - `deviceId` is a non-empty string
   - `metrics` is an object with ≤ 50 numeric keys
   - Rejects non-numeric metric values

4. **Deduplication** — if `packetId` was provided, a Redis `SET NX EX <ttl>` is attempted. If the key already exists, the packet is discarded immediately — this prevents duplicate alerts when sensors retry on network error. TTL is controlled by `PACKET_DEDUPE_TTL_SECONDS` (default 120 seconds, max 7 days).

5. **Redis pipeline** — one atomic write:
   - `XADD stream:telemetry:ingest` — picked up by the rule-eval worker
   - `XADD stream:telemetry:persist` — picked up by the telemetry worker

6. **Response** returns immediately with `{ message: "Telemetry accepted", packetId, processedMetrics }`. The sensor does not wait for rule evaluation.

---

## Workers

All workers are Node.js processes running alongside the API server. They communicate exclusively via Redis streams (not HTTP).

### rule-eval worker (`src/workers/rule-eval.worker.js`)

Reads from `stream:telemetry:ingest` using a Redis consumer group.

**For each packet:**
1. Load all active rules for the `deviceId` from cache (rules cached in Redis per device, invalidated on rule change)
2. For each metric in the packet, find the matching rule
3. Check if value is outside the safe zone `[min_value, max_value)` — min inclusive, max exclusive
4. Track consecutive violation count per `device_id + metric_name` (Redis counter, TTL resets on a good reading)
5. If `trigger_mode = PACKET_ONLY` and consecutive count ≥ `packet_threshold` → fire alert
6. If `trigger_mode = DURATION_ONLY` — record first_violation_at, check elapsed minutes ≥ `duration_minutes`
7. If `trigger_mode = BOTH` — fire on whichever threshold is reached first
8. On alert: `INSERT INTO alerts` (or update existing OPEN alert's `current_value` and `triggered_at`)
9. ACK the stream message

### telemetry worker (`src/workers/telemetry.worker.js`)

Reads from `stream:telemetry:persist` using a consumer group.

**For each packet:**
1. `INSERT INTO telemetry_data (device_id, timestamp, metrics)`
2. ACK the stream message

This worker is deliberately separate from rule-eval so a slow database write does not delay alert evaluation. Multiple packets from the same device at the same timestamp are allowed — there is no uniqueness constraint on `(device_id, timestamp)`.

### escalation scheduler (`src/workers/escalation.worker.js` / `src/scheduler/escalation.scheduler.js`)

Runs as a cron job every 60 seconds.

**Algorithm:**
1. Load all escalation policies ordered by `rule_id, level ASC`
2. For each policy at level L, find all OPEN alerts where:
   - `rule_id` matches
   - `current_level = L` (not yet escalated past this level)
   - `triggered_at < NOW() - escalate_after_minutes`
3. For each matching alert:
   - Increment `current_level`
   - Update `last_updated_at`
   - Push to `stream:alert:notifications`

### notification worker (`src/workers/notification.worker.js`)

Reads from `stream:alert:notifications`.

**For each message:**
1. Build email body with alert details (device, metric, value, severity, level)
2. Send via Nodemailer (SMTP — configured in `.env`)
3. ACK the stream message

### mqtt worker (`src/workers/mqtt.worker.js`) — Optional

Subscribes to an MQTT broker topic. Translates each MQTT message into the standard ingest payload format and calls `POST /api/ingest` internally. Useful for devices that speak MQTT natively rather than HTTP.

---

## Data Models

### `alerts`

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | Auto-increment |
| `rule_id` | integer FK | → `rules.id`. SET NULL on rule delete |
| `device_id` | string | Denormalized copy of the device string ID |
| `metric_name` | string(50) | Metric that violated the rule |
| `current_value` | double | Last observed violating value |
| `min_value` | double | Rule lower bound at time of alert |
| `max_value` | double | Rule upper bound at time of alert |
| `severity` | string(20) | HIGH / MEDIUM / LOW |
| `status` | string(20) | OPEN / ACKNOWLEDGED / RESOLVED |
| `current_level` | integer | Escalation level reached (0 = not yet escalated) |
| `first_triggered_at` | timestamp | First violation time |
| `triggered_at` | timestamp | Most recent violation time |
| `acknowledged_at` | timestamp | When status changed to ACKNOWLEDGED |
| `acknowledged_by` | string(100) | Who acknowledged it |
| `resolved_at` | timestamp | When status changed to RESOLVED |
| `last_updated_at` | timestamp | Last status change |

### `rules`

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `device_id` | string(100) | Matches device registry |
| `metric_name` | string(100) | Metric key in packet |
| `min_value` | double | Lower bound (inclusive). Value `< min_value` is a violation |
| `max_value` | double | Upper bound (exclusive). Value `>= max_value` is a violation |
| `severity` | string | HIGH / MEDIUM / LOW |
| `packet_threshold` | integer | N consecutive violations to fire. Default 3 |
| `duration_minutes` | integer | Minutes sustained out of range to fire. Default 1 |
| `trigger_mode` | string | PACKET_ONLY / DURATION_ONLY / BOTH. Default BOTH |
| `enabled` | boolean | Disabled rules are skipped during evaluation |

### `devices`

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `device_id` | string UNIQUE | Public identifier used in packets |
| `name` | string | Human-readable label |
| `location` | string | Physical location |
| `device_type` | string | Sensor type label |
| `is_active` | boolean | Inactive devices still ingest but are flagged |

### `telemetry_data`

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | |
| `device_id` | string | Source device |
| `timestamp` | bigint | Sensor-reported time (Unix milliseconds) |
| `metrics` | JSONB | Full key-value metrics object |
| `created_at` | timestamp | Server insert time |

Indexed on `device_id` and `timestamp` individually. No uniqueness constraint — multiple packets from the same device at the same millisecond are stored without conflict.

### `escalation_policies`

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `rule_id` | integer FK | → `rules.id`. CASCADE DELETE — deleting a rule removes all its policies |
| `level` | integer | 0 = first escalation, 1 = second, etc. Unique per rule |
| `escalate_after_minutes` | integer | Time after alert fires before this level escalates |
| `notify_via` | string | EMAIL |
| `notify_to` | string | Email address |

---

## Redis Key Space

| Key / Stream | Type | Purpose |
|---|---|---|
| `stream:telemetry:ingest` | Stream | Packets queued for rule evaluation |
| `stream:telemetry:persist` | Stream | Packets queued for database persistence |
| `stream:alert:notifications` | Stream | Escalation notifications queued for email |
| `packet:{packetId}` | String (NX, TTL = `PACKET_DEDUPE_TTL_SECONDS`) | Deduplication lock per packet |
| `rules:{deviceId}` | Hash | Cached rule map per device, key = metric name |
| `violation:{deviceId}:{metric}` | Counter (TTL = window) | Consecutive violation count |
| `alert:active:{deviceId}:{metric}` | String (NX, TTL 300s) | Lock preventing duplicate alert creation |
| `breach:{deviceId}:{metric}` | String (TTL = window) | Timestamp of first violation in current window |

Consumer groups are created automatically on worker startup if they don't exist.

---

## Rule Evaluation Logic

```
for each (metric, value) in packet:
  rule = find enabled rule where device_id = packet.deviceId AND metric_name = metric
  if no rule: skip

  # Safe zone: [min_value, max_value) — min inclusive, max exclusive
  inRange = value >= rule.min_value AND value < rule.max_value

  if inRange:
    reset violations counter
    continue

  # out of range
  increment violations[deviceId:metric]
  firstViolationAt = get or set timestamp for this device:metric pair

  if triggerMode = PACKET_ONLY or BOTH:
    if violations >= packet_threshold: FIRE

  if triggerMode = DURATION_ONLY or BOTH:
    elapsed = now - firstViolationAt (minutes)
    if elapsed >= duration_minutes: FIRE
```

Firing an alert upserts — if an OPEN alert already exists for the same `(device_id, metric_name)` combination, it updates `current_value` and `triggered_at` rather than creating a new row.

---

## Dashboard — Next.js Proxy

The Next.js app does not call the backend directly from the browser. All API calls go to `http://localhost:3000/api/*` which Next.js rewrites to `http://localhost:5000/api/*` (configured in `next.config.ts`). The `/health` endpoint is also proxied so the sidebar can poll it.

This means:
- The browser never needs to know the backend port
- CORS is not an issue in production (same-origin from the browser's perspective)
- The `x-api-key` header is added server-side, not exposed in the browser

```
Browser → localhost:3000/api/alerts
  → next.config.ts rewrite → localhost:5000/api/alerts
  → Express handler → PostgreSQL query → JSON response
```

---

## Scalability Notes

**Horizontal scaling** is possible because:
- Workers use Redis consumer groups — multiple worker instances share work without duplication
- The API is stateless — run multiple instances behind a load balancer
- PostgreSQL is the single source of truth — no in-memory state in the API or workers

**Bottlenecks** at scale:
1. Rule-eval worker CPU — O(rules per device) per packet. Mitigate: shard by device prefix, or increase `METRIC_EVAL_CONCURRENCY`
2. PostgreSQL write throughput — `telemetry_data` rows grow at ~1 row per packet. Partition by month for very high volumes
3. Redis stream backlog — if workers crash, messages accumulate. Monitor `XLEN stream:telemetry:ingest`

**Realistic ceiling on a single server:** ~200–500 packets/sec (tested at 195/sec with zero errors).
