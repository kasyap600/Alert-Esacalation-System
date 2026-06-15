# Production Runbook

## Services
- `api`: receives ingestion and admin traffic.
- `rule-worker`: consumes telemetry stream and evaluates rules.
- `telemetry-worker`: persists telemetry to PostgreSQL.
- `escalation-worker`: escalates open alerts on schedule.
- `notification-worker`: delivers email notifications from Redis pub/sub.

## Startup Order
1. Start PostgreSQL and Redis.
2. Run `npm run migrate:prod`.
3. Start API and all workers:
   - `npm run start:api`
   - `npm run start:rule-worker`
   - `npm run start:telemetry-worker`
   - `npm run start:escalation-worker`
   - `npm run start:notification-worker`

## Health Checks
- Liveness: `GET /health`
- Readiness: `GET /ready`
- Metrics snapshot: `GET /metrics`

## Security Baseline
- Set `ADMIN_API_KEY` and `INGEST_API_KEY`.
- Keep secrets outside source control.
- Restrict DB and Redis to private network.

## Load Test
- Run `npm run loadtest:1000`.
- Tune with env:
  - `LOADTEST_API_URL`
  - `LOADTEST_DEVICE_COUNT`
  - `LOADTEST_INTERVAL_MS`

## Canary Rollout
1. Deploy API + workers to one instance group.
2. Route 5% telemetry traffic for 30 minutes.
3. Watch queue lag, error counters, and alert latency.
4. Increase to 25%, then 100% if stable.

## Rollback
1. Stop new traffic to latest version.
2. Keep workers draining current queue.
3. Switch API/workers to previous image tag.
4. Verify alert creation and escalation before reopening traffic.
