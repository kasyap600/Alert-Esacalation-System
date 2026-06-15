/**
 * Central env resolution and startup validation (Step 1: secure config).
 */

function resolveDbPassword() {
  const raw =
    process.env.DB_PASSWORD ??
    process.env.POSTGRES_PASSWORD ??
    process.env.PGPASSWORD;
  if (raw === undefined || raw === null) return undefined;
  const trimmed = String(raw).trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

const MIN_KEY_LENGTH = 8;

/** When true, ADMIN_API_KEY and INGEST_API_KEY are required at startup. */
function isEnforcingApiKeys() {
  return (
    process.env.NODE_ENV === 'production' || process.env.ENFORCE_API_KEYS === 'true'
  );
}

function validateDatabaseCredentials() {
  if (!resolveDbPassword()) {
    throw new Error(
      'Database password required: set DB_PASSWORD, POSTGRES_PASSWORD, or PGPASSWORD to a non-empty value (SCRAM auth).'
    );
  }
}

function validateApiServerEnv() {
  const errors = [];
  try {
    validateDatabaseCredentials();
  } catch (e) {
    errors.push(e.message);
  }

  if (isEnforcingApiKeys()) {
    const admin = process.env.ADMIN_API_KEY;
    if (!admin || String(admin).trim().length < MIN_KEY_LENGTH) {
      errors.push(
        `ADMIN_API_KEY must be set and at least ${MIN_KEY_LENGTH} characters (enforced because NODE_ENV=production or ENFORCE_API_KEYS=true).`
      );
    }

    const ingest = process.env.INGEST_API_KEY;
    if (!ingest || String(ingest).trim().length < MIN_KEY_LENGTH) {
      errors.push(
        `INGEST_API_KEY must be set and at least ${MIN_KEY_LENGTH} characters (same conditions).`
      );
    }
  }

  if (errors.length) {
    throw new Error(`Environment validation failed:\n- ${errors.join('\n- ')}`);
  }
}

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

/**
 * CORS: if CORS_ORIGIN is unset in production, browsers get no ACAO (curl still works).
 * In non-production, common local dev origins (Next.js, Vite) are allowed so the dashboard can load data.
 * Override with CORS_ORIGIN=http://localhost:3000 or comma-separated list; use CORS_ORIGIN=* for any origin (dev only).
 */
function getCorsOptions() {
  const raw = process.env.CORS_ORIGIN;
  if (!raw || String(raw).trim() === '') {
    if (process.env.NODE_ENV === 'production') {
      return { origin: false, credentials: false };
    }
    return {
      origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (DEFAULT_DEV_ORIGINS.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      credentials: false,
    };
  }
  if (String(raw).trim() === '*') {
    return { origin: true, credentials: false };
  }
  const origins = String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (origins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: process.env.CORS_CREDENTIALS === 'true'
  };
}

function getJsonBodyLimit() {
  return process.env.JSON_BODY_LIMIT || '256kb';
}

module.exports = {
  resolveDbPassword,
  validateDatabaseCredentials,
  validateApiServerEnv,
  isEnforcingApiKeys,
  getCorsOptions,
  getJsonBodyLimit
};
