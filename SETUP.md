# IoT Alert Escalation System — Setup Guide

A real-time IoT monitoring platform. Sensors send data → rules evaluate it → alerts fire → escalation emails are sent if ignored.

---

## What You Need Before Starting

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 18 or 20 | https://nodejs.org |
| Docker + Docker Compose | Latest | https://docker.com — easiest way to run PostgreSQL + Redis |
| Git | Any | To clone the project |
| A terminal | — | macOS Terminal, Windows PowerShell, or Linux shell |

---

## Option A — Run with Docker (Recommended)

This starts everything — backend, workers, database, and Redis — with one command.

### 1. Clone the project

```bash
git clone <your-repo-url>
cd "alert-escalation-system - upgrade"
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

Open `.env` and fill in the required values:

```env
# Database (already set correctly for Docker — do not change)
DB_HOST=postgres
DB_PORT=5432
DB_NAME=alert_escalation_db
DB_USER=postgres
DB_PASSWORD=postgres

# Redis (already set correctly for Docker — do not change)
REDIS_HOST=redis
REDIS_PORT=6379

# API Keys — set these to something secret (min 8 characters)
ADMIN_API_KEY=change-me-admin-key
INGEST_API_KEY=change-me-ingest-key
ENFORCE_API_KEYS=true

# Email — needed for escalation notifications
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

> **Gmail tip:** Use an App Password, not your real password.
> Go to Google Account → Security → 2-Step Verification → App Passwords.

### 3. Start the system

```bash
docker compose -f docker-compose.production.yml up --build
```

This starts:
- `api` — REST API on port **5000**
- `rule-worker` — evaluates incoming sensor data against rules
- `telemetry-worker` — saves packets to the database
- `escalation-worker` — checks for unacknowledged alerts every minute
- `notification-worker` — sends emails
- `postgres` — database on port 5432
- `redis` — message queue on port 6379

### 4. Run database migrations

Open a second terminal and run:

```bash
docker compose -f docker-compose.production.yml exec api node src/scripts/runMigrations.js
```

This creates all required tables. Only needed once.

### 5. Verify it's running

```bash
curl http://localhost:5000/health
# Expected: {"status":"ok"}
```

---

## Option B — Run Without Docker (Manual)

Use this if you already have PostgreSQL and Redis installed on your machine.

### 1. Install PostgreSQL and Redis

- PostgreSQL 16: https://www.postgresql.org/download
- Redis 7: https://redis.io/download

Create the database:
```sql
CREATE DATABASE alert_escalation_db;
```

### 2. Install dependencies

```bash
cd "alert-escalation-system - upgrade"
npm install
```

### 3. Create your `.env` file

```bash
cp .env.example .env
```

Edit `.env` — change `DB_HOST` to `localhost` and `REDIS_HOST` to `localhost`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=alert_escalation_db
DB_USER=postgres
DB_PASSWORD=your-postgres-password

REDIS_HOST=localhost
REDIS_PORT=6379

ADMIN_API_KEY=change-me-admin-key
INGEST_API_KEY=change-me-ingest-key
ENFORCE_API_KEYS=true

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

### 4. Run migrations

```bash
npm run migrate:prod
```

### 5. Start the backend

```bash
npm run local:stack:full
```

This starts the API + all 5 workers in one terminal.

---

## Setting Up the Dashboard

The dashboard is a Next.js app in the `dashboard/` folder.

### 1. Install dependencies

```bash
cd dashboard
npm install
```

### 2. Create `.env.local`

```bash
# dashboard/.env.local
BACKEND_ORIGIN=http://localhost:5000
```

If the backend has API key auth enabled, also add:
```env
ADMIN_API_KEY=change-me-admin-key
```

### 3. Start the dashboard

```bash
npm run dev
```

Open http://localhost:3000 in your browser.

---

## How to Connect Your Sensors

Once the system is running, connect your IoT devices in 3 steps:

### Step 1 — Register the device

Open the dashboard → **Devices** → **Add Device**.

Or via API:
```bash
curl -X POST http://localhost:5000/api/devices \
  -H "Content-Type: application/json" \
  -H "x-api-key: change-me-admin-key" \
  -d '{
    "name": "Boiler Room Sensor",
    "location": "Building A",
    "device_type": "temperature_sensor"
  }'
```

Note the `device_id` in the response (e.g. `device-42`).

### Step 2 — Create a rule

Open the dashboard → **Rules** → **Add Rule**.

Example: temperature must stay between 10°C and 80°C. If it exceeds 80°C 3 times in a row → HIGH alert.

### Step 3 — Send data from your sensor

Every sensor sends a POST request to:

```
POST http://YOUR_SERVER_IP:5000/api/ingest
Header: x-ingest-key: change-me-ingest-key
Header: Content-Type: application/json
```

**Payload:**
```json
{
  "deviceId": "device-42",
  "timestamp": 1718956800000,
  "packetId": "device-42-1718956800000",
  "metrics": {
    "temperature": 73.4,
    "pressure": 1012.5,
    "humidity": 65.2
  }
}
```

| Field | Required | Description |
|---|---|---|
| `deviceId` | Yes | Must match a registered device |
| `metrics` | Yes | All values must be numbers. Max 50 keys per packet |
| `timestamp` | No | Unix milliseconds. Uses server time if omitted |
| `packetId` | No | Unique ID per packet — prevents duplicate processing on retries |

### Code examples

**Python (Raspberry Pi / Linux):**
```python
import requests, time

SERVER = "http://192.168.1.45:5000"   # replace with your server IP
INGEST_KEY = "change-me-ingest-key"
DEVICE_ID = "device-42"

while True:
    requests.post(f"{SERVER}/api/ingest",
        json={
            "deviceId": DEVICE_ID,
            "timestamp": int(time.time() * 1000),
            "packetId": f"{DEVICE_ID}-{int(time.time())}",
            "metrics": {
                "temperature": read_temperature(),
                "pressure": read_pressure(),
            }
        },
        headers={"x-ingest-key": INGEST_KEY},
        timeout=5
    )
    time.sleep(10)
```

**Node.js:**
```js
const axios = require('axios')

const SERVER = 'http://192.168.1.45:5000'
const INGEST_KEY = 'change-me-ingest-key'

setInterval(async () => {
  await axios.post(`${SERVER}/api/ingest`, {
    deviceId: 'device-42',
    timestamp: Date.now(),
    packetId: `device-42-${Date.now()}`,
    metrics: { temperature: readTemp(), pressure: readPressure() }
  }, { headers: { 'x-ingest-key': INGEST_KEY } })
}, 10000)
```

**ESP32 / Arduino:**
```cpp
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* serverUrl = "http://192.168.1.45:5000/api/ingest";
const char* ingestKey = "change-me-ingest-key";

void sendTelemetry(float temp, float pressure) {
  HTTPClient http;
  http.begin(serverUrl);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-ingest-key", ingestKey);

  StaticJsonDocument<256> doc;
  doc["deviceId"] = "device-42";
  doc["timestamp"] = millis();
  JsonObject metrics = doc.createNestedObject("metrics");
  metrics["temperature"] = temp;
  metrics["pressure"] = pressure;

  String body;
  serializeJson(doc, body);
  http.POST(body);
  http.end();
}
```

---

## Setting Up Escalation (Email Alerts)

1. Go to dashboard → **Escalation** → **Add Level**
2. Select your rule
3. Configure:
   - **Level 0** — After 1 minute unacknowledged → email your operator
   - **Level 1** — After 10 minutes → email your manager

If an alert fires and nobody acknowledges it in the dashboard within the configured time, the system automatically sends an email.

---

## Useful Commands

```bash
# Check if backend is healthy
curl http://localhost:5000/health

# Test sending a packet manually (no sensor needed)
curl -X POST http://localhost:5000/api/ingest \
  -H "Content-Type: application/json" \
  -H "x-ingest-key: change-me-ingest-key" \
  -d '{"deviceId":"device-42","metrics":{"temperature":95}}'

# Run automated end-to-end tests
cd "alert-escalation-system - upgrade"
npm run test:e2e

# Run load test — 100 devices × 10 metrics
npm run loadtest:100

# View logs (Docker)
docker compose -f docker-compose.production.yml logs -f api
```

---

## Project Structure

```
alert-escalation-system - upgrade/   ← Backend (Node.js / Express)
  src/
    server.js              ← API entry point (port 5000)
    workers/               ← Background workers (rule-eval, telemetry, escalation, notification, mqtt)
    rules/                 ← Rule evaluation logic
    alerts/                ← Alert management
    devices/               ← Device registry
    ingestion/             ← Packet ingest endpoint
    scheduler/             ← Escalation cron job (every 1 min)
    notifications/         ← Email sending
    db/models/             ← Database models (Sequelize + PostgreSQL)
  migrations/              ← SQL migration files
  .env.example             ← All available config options with descriptions

dashboard/                 ← Frontend (Next.js 15)
  app/
    page.tsx               ← Dashboard home (stats + recent alerts)
    devices/               ← Device management
    rules/                 ← Rule configuration
    alerts/                ← Alert monitoring + bulk actions
    escalation/            ← Escalation policy editor
    telemetry/             ← Analytics page
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Cannot connect to database` | Check `DB_HOST`, `DB_PORT`, `DB_PASSWORD` in `.env`. Run `docker compose up postgres` first. |
| `Redis connection refused` | Check `REDIS_HOST` in `.env`. Run `docker compose up redis` first. |
| `Unauthorized ingest request` | Add `x-ingest-key` header matching `INGEST_API_KEY` in `.env`. |
| `Unauthorized` on dashboard API calls | Add `x-api-key` header matching `ADMIN_API_KEY`. |
| Alerts not firing | Check the rule's `deviceId` matches exactly what your sensor sends. Check `packet_threshold` — need that many violations in a row. |
| Emails not sending | Verify `EMAIL_HOST`, `EMAIL_USER`, `EMAIL_PASS` in `.env`. For Gmail use an App Password. |
| Dashboard shows old data | Restart the backend — Node.js does not hot-reload code changes. |
| Rules/Devices page shows no pagination | The dashboard handles this automatically — it falls back to client-side pagination if the backend returns a plain array. If you see missing pages, restart the backend to pick up the latest server-side pagination code. |
