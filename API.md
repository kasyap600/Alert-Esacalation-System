# API Reference

Base URL: `http://localhost:5000`

---

## Authentication

| Header | Used for |
|---|---|
| `x-api-key: <ADMIN_API_KEY>` | All management endpoints (`/api/rules`, `/api/devices`, `/api/alerts`, `/api/admin/*`, `/api/telemetry`) |
| `x-ingest-key: <INGEST_API_KEY>` | Sensor data endpoint (`POST /api/ingest`) |

Set `ENFORCE_API_KEYS=false` in `.env` to disable auth (development only).

---

## System Endpoints

### Health Check

```
GET /health
```

No auth required.

**Response 200:**
```json
{ "status": "ok" }
```

---

### Readiness Check

```
GET /ready
```

No auth required. Returns 503 if database or Redis is unreachable.

**Response 200:**
```json
{
  "status": "ready",
  "checks": { "database": true, "redis": true }
}
```

**Response 503:**
```json
{ "status": "not_ready", "error": "dependency_unavailable" }
```

---

### Metrics Snapshot

```
GET /metrics
Header: x-api-key: <ADMIN_API_KEY>
```

Returns internal counters (packets ingested, alerts fired, etc.). Requires `x-api-key` by default. Set `METRICS_REQUIRE_AUTH=false` in `.env` to open it without auth (only for trusted internal networks).

---

## Ingest

### Submit Sensor Packet

```
POST /api/ingest
Header: x-ingest-key: <INGEST_API_KEY>
```

**Request body:**
```json
{
  "deviceId": "device-42",
  "metrics": {
    "temperature": 73.4,
    "pressure": 1012.5,
    "humidity": 65.2
  },
  "timestamp": 1718956800000,
  "packetId": "device-42-1718956800000"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `deviceId` | string | Yes | Must match a registered device |
| `metrics` | object | Yes | Keys = metric names, values = numbers. Max 50 keys |
| `timestamp` | number | No | Unix milliseconds. Defaults to server time |
| `packetId` | string | No | Unique ID for deduplication. Prevents reprocessing on retry. TTL controlled by `PACKET_DEDUPE_TTL_SECONDS` (default 120s) |

**Response 200:**
```json
{
  "message": "Telemetry accepted",
  "packetId": "device-42-1718956800000",
  "processedMetrics": ["temperature", "pressure", "humidity"]
}
```

**Response 400** (validation failed):
```json
{ "error": "deviceId is required and must be a non-empty string" }
```

---

## Devices

All endpoints require `x-api-key`.

### List Devices

```
GET /api/devices?page=1&limit=50
```

| Query param | Default | Notes |
|---|---|---|
| `page` | 1 | Page number |
| `limit` | 50 | Max 200 |

**Response 200:**
```json
{
  "data": [
    {
      "id": 1,
      "device_id": "device-1",
      "name": "Boiler Room Sensor",
      "location": "Building A",
      "device_type": "temperature_sensor",
      "is_active": true,
      "createdAt": "2024-06-01T10:00:00.000Z",
      "updatedAt": "2024-06-01T10:00:00.000Z"
    }
  ],
  "pagination": { "total": 42, "page": 1, "limit": 50, "pages": 1 }
}
```

---

### Create Device

```
POST /api/devices
Header: x-api-key: <ADMIN_API_KEY>
```

**Request body:**
```json
{
  "name": "Boiler Room Sensor",
  "location": "Building A",
  "device_type": "temperature_sensor",
  "device_id": "boiler-01"
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | Yes | Human-readable name |
| `location` | No | Physical location |
| `device_type` | No | Sensor type label |
| `device_id` | No | Custom string ID. If omitted, auto-assigned as `device-<id>` |

**Response 201:**
```json
{
  "id": 5,
  "device_id": "boiler-01",
  "name": "Boiler Room Sensor",
  "location": "Building A",
  "device_type": "temperature_sensor",
  "is_active": true
}
```

---

### Update Device

```
PUT /api/devices/:id
Header: x-api-key: <ADMIN_API_KEY>
```

**Request body** (all fields optional):
```json
{
  "name": "Updated Name",
  "location": "Building B",
  "device_type": "pressure_sensor",
  "is_active": false
}
```

Note: `device_id` cannot be changed via this endpoint.

**Response 200:** Returns updated device object.

---

### Toggle Device Active/Inactive

```
PATCH /api/devices/:id/toggle
Header: x-api-key: <ADMIN_API_KEY>
```

No body required. Flips `is_active` between `true` and `false`.

**Response 200:** Returns updated device object.

---

### Delete Device

```
DELETE /api/devices/:id
Header: x-api-key: <ADMIN_API_KEY>
```

**Response 200:**
```json
{ "message": "Device deleted successfully" }
```

---

## Rules

All endpoints require `x-api-key`.

### List Rules

```
GET /api/rules?page=1&limit=50&deviceId=device-42
```

| Query param | Default | Notes |
|---|---|---|
| `page` | 1 | Page number |
| `limit` | 50 | Max 200 |
| `deviceId` | — | Filter by device ID string |

**Response 200:**
```json
{
  "data": [
    {
      "id": 1,
      "device_id": "device-42",
      "metric_name": "temperature",
      "min_value": 10,
      "max_value": 80,
      "severity": "HIGH",
      "packet_threshold": 3,
      "duration_minutes": 0,
      "trigger_mode": "BOTH",
      "enabled": true
    }
  ],
  "pagination": { "total": 12, "page": 1, "limit": 50, "pages": 1 }
}
```

---

### Get Rule by ID

```
GET /api/rules/:ruleId
Header: x-api-key: <ADMIN_API_KEY>
```

**Response 200:** Single rule object.
**Response 404:** `{ "error": "Rule not found" }`

---

### Create Rule

```
POST /api/rules
Header: x-api-key: <ADMIN_API_KEY>
```

**Request body:**
```json
{
  "deviceId": "device-42",
  "metricName": "temperature",
  "minValue": 10,
  "maxValue": 80,
  "severity": "HIGH",
  "packetThreshold": 3,
  "durationMinutes": 0,
  "triggerMode": "BOTH"
}
```

| Field | Required | Type | Notes |
|---|---|---|---|
| `deviceId` | Yes | string | Must match a registered device |
| `metricName` | Yes | string | Metric key sent in packets |
| `minValue` | Yes | number | Lower bound (inclusive). Value `< minValue` is a violation |
| `maxValue` | Yes | number | Upper bound (exclusive). Value `>= maxValue` is a violation |
| `severity` | Yes | string | `HIGH`, `MEDIUM`, or `LOW` |
| `packetThreshold` | No | integer ≥ 1 | Consecutive violations needed to fire. Default 3 |
| `durationMinutes` | No | integer ≥ 0 | Minutes sustained out of range to fire. Required > 0 when `triggerMode` is `DURATION_ONLY` |
| `triggerMode` | No | string | `BOTH` (default), `PACKET_ONLY`, or `DURATION_ONLY` |
| `enabled` | No | boolean | Defaults to `true` |

> **Threshold semantics:** The safe zone is `[minValue, maxValue)` — min is inclusive, max is exclusive. A sensor reading of exactly `maxValue` is treated as a violation.

**Response 201:**
```json
{
  "message": "Rule created successfully",
  "rule": { ... }
}
```

**Response 409:** `{ "error": "Rule already exists for this device and metric" }`

---

### Update Rule

```
PUT /api/rules/:ruleId
Header: x-api-key: <ADMIN_API_KEY>
```

Same camelCase field names as Create (all fields optional in update mode). Updatable fields: `minValue`, `maxValue`, `packetThreshold`, `durationMinutes`, `severity`, `enabled`, `triggerMode`.

**Response 200:**
```json
{ "message": "Rule updated successfully", "rule": { ... } }
```

---

### Delete Rule

```
DELETE /api/rules/:ruleId
Header: x-api-key: <ADMIN_API_KEY>
```

Deleting a rule also deletes all its escalation policies (cascade).

**Response 200:**
```json
{ "message": "Rule deleted successfully" }
```

---

## Alerts

All endpoints require `x-api-key`.

### List Alerts

```
GET /api/alerts?page=1&limit=25&status=OPEN
```

| Query param | Default | Notes |
|---|---|---|
| `page` | 1 | Page number |
| `limit` | 100 | Max 500 |
| `status` | — | Filter: `OPEN`, `ACKNOWLEDGED`, or `RESOLVED` |

**Response 200:**
```json
{
  "data": [
    {
      "id": 101,
      "device_id": "device-42",
      "rule_id": 1,
      "metric_name": "temperature",
      "current_value": 95.2,
      "severity": "HIGH",
      "status": "OPEN",
      "current_level": 0,
      "triggered_at": "2024-06-15T14:30:00.000Z",
      "acknowledged_at": null,
      "acknowledged_by": null,
      "resolved_at": null,
      "last_updated_at": "2024-06-15T14:30:00.000Z"
    }
  ],
  "pagination": { "total": 1540, "page": 1, "limit": 25, "pages": 62 }
}
```

---

### Get Alert by ID

```
GET /api/alerts/:id
Header: x-api-key: <ADMIN_API_KEY>
```

**Response 200:** Single alert object.

---

### Update Alert Status

```
PUT /api/alerts/:id
Header: x-api-key: <ADMIN_API_KEY>
```

**Request body:**
```json
{
  "status": "ACKNOWLEDGED",
  "acknowledgedBy": "operator-name"
}
```

| Field | Required | Notes |
|---|---|---|
| `status` | Yes | `OPEN`, `ACKNOWLEDGED`, or `RESOLVED` |
| `acknowledgedBy` | No | Name of the operator. Used only when status = `ACKNOWLEDGED` |

**Response 200:** Returns updated alert object.

---

## Escalation Policies

All endpoints require `x-api-key`.

### List Escalation Policies

```
GET /api/admin/escalation-policies?ruleId=1
```

Returns all policies, ordered by rule then level. Optionally filter by `ruleId`.

**Response 200:**
```json
[
  {
    "id": 1,
    "rule_id": 1,
    "level": 0,
    "escalate_after_minutes": 1,
    "notify_via": "EMAIL",
    "notify_to": "operator@example.com"
  },
  {
    "id": 2,
    "rule_id": 1,
    "level": 1,
    "escalate_after_minutes": 10,
    "notify_via": "EMAIL",
    "notify_to": "manager@example.com"
  }
]
```

---

### Create Escalation Policy

```
POST /api/admin/escalation-policy
Header: x-api-key: <ADMIN_API_KEY>
```

**Request body:**
```json
{
  "ruleId": 1,
  "level": 0,
  "escalateAfterMinutes": 5,
  "notifyVia": "EMAIL",
  "notifyTo": "operator@example.com"
}
```

| Field | Required | Notes |
|---|---|---|
| `ruleId` | Yes | Must match an existing rule |
| `level` | Yes | Integer ≥ 0. L0 escalates first, then L1, L2, etc. |
| `escalateAfterMinutes` | Yes | Minutes after alert fires before escalating |
| `notifyVia` | Yes | `EMAIL` (only supported channel currently) |
| `notifyTo` | Yes | Email address to notify |

**Response 201:**
```json
{
  "message": "Escalation level created successfully",
  "policy": { ... }
}
```

**Response 409:** `{ "error": "Level 0 already exists for this rule" }`

---

### Update Escalation Policy

```
PUT /api/admin/escalation-policy/:id
Header: x-api-key: <ADMIN_API_KEY>
```

**Request body** (all fields optional):
```json
{
  "escalateAfterMinutes": 10,
  "notifyVia": "EMAIL",
  "notifyTo": "manager@example.com"
}
```

Note: `ruleId` and `level` cannot be changed — delete and recreate to change those.

**Response 200:**
```json
{ "message": "Escalation policy updated", "policy": { ... } }
```

---

### Delete Escalation Policy

```
DELETE /api/admin/escalation-policy/:id
Header: x-api-key: <ADMIN_API_KEY>
```

**Response 200:**
```json
{ "message": "Escalation policy deleted" }
```

---

## Telemetry

All endpoints require `x-api-key`.

### List Raw Telemetry Records

```
GET /api/telemetry?page=1&limit=25&deviceId=device-42
```

Returns stored sensor packet records, newest first.

| Query param | Default | Notes |
|---|---|---|
| `page` | 1 | Page number |
| `limit` | 25 | Max 200 |
| `deviceId` | — | Filter to one device |

**Response 200:**
```json
{
  "data": [
    {
      "id": 5001,
      "device_id": "device-42",
      "timestamp": 1718956800000,
      "metrics": {
        "temperature": 73.4,
        "pressure": 1012.5,
        "humidity": 65.2
      },
      "created_at": "2024-06-15T14:30:01.000Z"
    }
  ],
  "pagination": { "total": 23900, "page": 1, "limit": 25, "pages": 956 }
}
```

---

## Common Error Responses

| Status | Meaning |
|---|---|
| `400` | Validation error — see `error` field for details |
| `401` | Missing or invalid API key |
| `404` | Resource not found |
| `409` | Conflict — duplicate record |
| `500` | Internal server error |

All errors return:
```json
{ "error": "Human-readable error message" }
```

---

## Quick Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | None | Health check |
| `GET` | `/ready` | None | Readiness probe |
| `GET` | `/metrics` | Admin key | Internal metrics snapshot |
| `POST` | `/api/ingest` | Ingest key | Submit sensor data |
| `GET` | `/api/devices` | Admin key | List devices |
| `POST` | `/api/devices` | Admin key | Create device |
| `PUT` | `/api/devices/:id` | Admin key | Update device |
| `PATCH` | `/api/devices/:id/toggle` | Admin key | Toggle active |
| `DELETE` | `/api/devices/:id` | Admin key | Delete device |
| `GET` | `/api/rules` | Admin key | List rules |
| `GET` | `/api/rules/:id` | Admin key | Get rule |
| `POST` | `/api/rules` | Admin key | Create rule |
| `PUT` | `/api/rules/:id` | Admin key | Update rule |
| `DELETE` | `/api/rules/:id` | Admin key | Delete rule (cascades policies) |
| `GET` | `/api/alerts` | Admin key | List alerts |
| `GET` | `/api/alerts/:id` | Admin key | Get alert |
| `PUT` | `/api/alerts/:id` | Admin key | Update alert status |
| `GET` | `/api/admin/escalation-policies` | Admin key | List policies |
| `POST` | `/api/admin/escalation-policy` | Admin key | Create policy |
| `PUT` | `/api/admin/escalation-policy/:id` | Admin key | Update policy |
| `DELETE` | `/api/admin/escalation-policy/:id` | Admin key | Delete policy |
| `GET` | `/api/telemetry` | Admin key | List raw telemetry |
