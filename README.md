# IoT Alert Escalation System

A real-time IoT monitoring platform that ingests sensor data, evaluates it against configurable threshold rules, fires alerts when thresholds are breached, and escalates unacknowledged alerts via email.

---

## What It Does

1. **Sensors send data** — any device (Raspberry Pi, ESP32, PLC, etc.) sends a JSON packet to the ingest API
2. **Rules evaluate it** — the system checks if values are within the configured safe range
3. **Alerts fire** — if a rule is violated N times in a row (or sustained for N minutes), an alert is created
4. **Escalation kicks in** — if nobody acknowledges the alert within a configured time, an email is sent
5. **Dashboard shows everything** — operators can see live alerts, manage devices and rules, and view analytics

---

## Features

| Feature | Detail |
|---|---|
| Multi-metric packets | One packet can carry up to 50 metrics (temperature, pressure, humidity, etc.) |
| Flexible trigger modes | `BOTH` (default) — N bad readings OR sustained N minutes; `PACKET_ONLY` — readings only; `DURATION_ONLY` — duration only |
| Multi-level escalation | L0 → operator after 1 min, L1 → manager after 10 min, configurable per rule |
| Packet deduplication | Duplicate packets (retries) are silently discarded using Redis SET NX |
| Email notifications | Sends email when alerts go unacknowledged past the configured escalation threshold |
| Real-time dashboard | Next.js 15 dashboard with alerts, rules, devices, escalation, and analytics pages |
| Bulk operations | Bulk acknowledge / resolve alerts, bulk delete rules |
| Pagination | Server-side pagination on all data tables — handles millions of rows |
| Load tested | 195 packets/sec sustained with zero errors across 100 devices × 10 metrics |

---

## Architecture

```
IoT Sensor / Factory Device
         │
         │  POST /api/ingest
         ▼
   ┌─────────────┐
   │  API Server │  (Express — port 5000)
   └──────┬──────┘
          │ xadd → Redis Streams
          ▼
   ┌──────────────────────────────────────────┐
   │              Redis Streams               │
   │  stream:telemetry:ingest                 │  ← rule evaluation queue
   │  stream:telemetry:persist                │  ← database write queue
   │  stream:alert:notifications              │  ← email queue
   └──┬─────────────────────┬─────────────────┘
      │                     │
      ▼                     ▼
 ┌────────────┐      ┌──────────────────┐
 │ Rule-Eval  │      │ Telemetry Worker │
 │  Worker    │      │                  │
 └─────┬──────┘      └──────────────────┘
       │ creates alert          saves to PostgreSQL
       ▼
 ┌─────────────┐    ┌──────────────────────┐
 │ Escalation  │    │ Notification Worker  │
 │ Scheduler   │───▶│                      │──▶ Email
 │ (cron 1min) │    └──────────────────────┘
 └─────────────┘
          │
          ▼
    ┌──────────┐
    │PostgreSQL│  (alerts, rules, devices, telemetry_data, escalation_policies)
    └──────────┘
```

### Workers

| Worker | Role |
|---|---|
| `rule-eval` | Reads packets from Redis stream, evaluates against rules (`[min, max)` safe zone), creates alerts |
| `telemetry` | Reads packets from Redis stream, persists to `telemetry_data` table |
| `escalation` | Cron every 60s — finds unacknowledged alerts past their escalation time, queues notifications |
| `notification` | Reads from notification stream, sends emails via SMTP |
| `mqtt` | Optional — subscribes to MQTT broker and forwards packets to the ingest pipeline |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend API | Node.js 20, Express |
| Database | PostgreSQL 16, Sequelize ORM |
| Message queue | Redis 7 (Streams + pub/sub) |
| Frontend | Next.js 15, Tailwind CSS, Recharts |
| Charts | Recharts |
| Email | Nodemailer (SMTP) |
| Containerisation | Docker + Docker Compose |

---

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Node.js 18+ (for dashboard)

### 1. Clone and configure

```bash
git clone <repo-url>
cd "alert-escalation-system - upgrade"
cp .env.example .env
# Edit .env — set DB credentials, API keys, and email settings
```

### 2. Start the backend

```bash
docker compose -f docker-compose.production.yml up --build
```

### 3. Run database migrations (first time only)

```bash
docker compose -f docker-compose.production.yml exec api node src/scripts/runMigrations.js
```

### 4. Start the dashboard

```bash
cd dashboard
npm install
npm run dev
# Open http://localhost:3000
```

### 5. Send your first packet

```bash
curl -X POST http://localhost:5000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"device-1","metrics":{"temperature":95}}'
```

See [SETUP.md](./SETUP.md) for the full setup guide including sensor integration.

---

## Dashboard Pages

| Page | What it shows |
|---|---|
| **Dashboard** | 6 stat cards + recent open alerts + severity breakdown |
| **Devices** | Register and manage IoT devices — paginated, bulk delete |
| **Rules** | Threshold rules per device/metric — paginated, bulk delete |
| **Alerts** | Live alert feed — filter by status, bulk acknowledge/resolve, escalation level |
| **Escalation** | Configure multi-level escalation policies per rule — grouped by rule, inline edit/delete |
| **Analytics** | Alert status/severity charts, top alerting devices, top violated metrics |

---

## Project Structure

```
alert-escalation-system - upgrade/   ← Backend
  src/
    server.js                        ← API entry point
    app.js                           ← Express app factory
    workers/                         ← Worker entry points
    rules/                           ← Rule evaluation + CRUD
    alerts/                          ← Alert management
    devices/                         ← Device registry
    ingestion/                       ← Ingest endpoint + telemetry worker
    telemetry/                       ← Telemetry query endpoint
    scheduler/                       ← Escalation cron job
    notifications/                   ← Email sending
    admin/                           ← Escalation policies, queue health
    db/models/                       ← Sequelize models
    validation/                      ← Input validation
    middleware/                      ← Auth (API key)
    config/                          ← Environment config
  migrations/                        ← SQL migration scripts
  .env.example                       ← All config options documented

dashboard/                           ← Frontend (Next.js 15)
  app/                               ← Page components
  components/                        ← Shared UI components
  services/api.ts                    ← Axios client
  types/entities.ts                  ← TypeScript types

SETUP.md                             ← Full setup + sensor integration guide
API.md                               ← Complete API reference
ARCHITECTURE.md                      ← System design deep dive
test.md                              ← Test report (E2E + load test results)
```

---

## Performance

Tested on a single MacBook (Apple M-series, 16GB RAM):

| Test | Rate | Errors | Notes |
|---|---|---|---|
| Baseline | 47.6 packets/sec | 0% | 2s burst interval, 100 devices × 10 metrics |
| High rate | 195.1 packets/sec | 0% | 500ms burst interval, 23,900 packets in 120s |
| Alerts generated | 1,540 | — | In 120s at high rate |

**Realistic ceiling:** ~200–500 packets/sec on a single server before the rule-eval or telemetry worker becomes the bottleneck. Scale horizontally by running multiple worker instances against the same Redis consumer group.

---

## Docs

- [SETUP.md](./SETUP.md) — How to run, configure, and connect sensors
- [API.md](./API.md) — Complete API reference
- [ARCHITECTURE.md](./ARCHITECTURE.md) — System design and data flow
- [test.md](./test.md) — Test report
