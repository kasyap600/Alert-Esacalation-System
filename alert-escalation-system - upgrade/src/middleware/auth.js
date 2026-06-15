const crypto = require('crypto');
const { isEnforcingApiKeys } = require('../config/env');
const logger = require('../utils/logger');

let warnedAdminAuthDisabled;

function timingSafeEqualString(a, b) {
  const sa = String(a);
  const sb = String(b);
  if (sa.length !== sb.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sa, 'utf8'), Buffer.from(sb, 'utf8'));
  } catch {
    return false;
  }
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
