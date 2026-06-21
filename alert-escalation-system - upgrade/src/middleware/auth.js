const crypto = require('crypto');
const { isEnforcingApiKeys } = require('../config/env');
const logger = require('../utils/logger');

let warnedAdminAuthDisabled;

// Hash both sides to a fixed-length digest before comparing so key length
// cannot be inferred from timing (the early-exit on length mismatch would leak it).
function timingSafeEqualString(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function requireApiKey(req, res, next) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    if (isEnforcingApiKeys()) {
      return res.status(503).json({ error: 'ADMIN_API_KEY not configured' });
    }
    if (!warnedAdminAuthDisabled) {
      warnedAdminAuthDisabled = true;
      logger.warn('admin_auth_skipped_no_key_dev', {
        hint: 'Set ADMIN_API_KEY or use NODE_ENV=production + ENFORCE_API_KEYS to require keys.'
      });
    }
    return next();
  }
  const provided = req.headers['x-api-key'];
  if (!provided || !timingSafeEqualString(provided, expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

function requireIngestKey(req, res, next) {
  const expected = process.env.INGEST_API_KEY;
  if (!expected) {
    if (isEnforcingApiKeys()) {
      return res.status(503).json({ error: 'INGEST_API_KEY not configured' });
    }
    return next();
  }
  const provided = req.headers['x-ingest-key'];
  if (!provided || !timingSafeEqualString(provided, expected)) {
    return res.status(401).json({ error: 'Unauthorized ingest request' });
  }
  return next();
}

module.exports = {
  requireApiKey,
  requireIngestKey
};
