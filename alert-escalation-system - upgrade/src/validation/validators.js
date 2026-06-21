function asNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function validateTelemetryPayload(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Payload must be an object' };
  }
  const { deviceId, metrics, timestamp, packetId } = body;
  if (!deviceId || typeof deviceId !== 'string') {
    return { ok: false, error: 'deviceId must be a non-empty string' };
  }
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics)) {
    return { ok: false, error: 'metrics must be an object' };
  }
  const MAX_METRICS = 50;
  if (Object.keys(metrics).length > MAX_METRICS) {
    return { ok: false, error: `metrics must not contain more than ${MAX_METRICS} keys` };
  }
  const normalizedMetrics = {};
  for (const [key, value] of Object.entries(metrics)) {
    const numeric = asNumber(value);
    if (numeric === null) {
      return { ok: false, error: `metric ${key} must be numeric` };
    }
    normalizedMetrics[key] = numeric;
  }
  const normalizedTimestamp = timestamp ? asNumber(timestamp) : Date.now();
  if (normalizedTimestamp === null) {
    return { ok: false, error: 'timestamp must be numeric' };
  }
  return {
    ok: true,
    value: {
      deviceId,
      metrics: normalizedMetrics,
      timestamp: normalizedTimestamp,
      packetId: packetId || undefined
    }
  };
}

const VALID_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH'];
const VALID_TRIGGER_MODES = ['PACKET_ONLY', 'DURATION_ONLY', 'BOTH'];
const UPDATABLE_RULE_FIELDS = ['minValue', 'maxValue', 'packetThreshold', 'durationMinutes', 'severity', 'enabled', 'triggerMode'];

function validateRulePayload(body, isUpdate = false) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Payload must be an object' };
  }

  if (isUpdate) {
    const hasUpdatable = UPDATABLE_RULE_FIELDS.some((f) => body[f] !== undefined);
    if (!hasUpdatable) {
      return { ok: false, error: `Nothing to update. Provide at least one of: ${UPDATABLE_RULE_FIELDS.join(', ')}` };
    }
  } else {
    for (const field of ['deviceId', 'metricName', 'minValue', 'maxValue']) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        return { ok: false, error: `${field} is required` };
      }
    }
  }

  const minValue = body.minValue !== undefined ? asNumber(body.minValue) : undefined;
  const maxValue = body.maxValue !== undefined ? asNumber(body.maxValue) : undefined;
  if (minValue !== undefined && minValue === null) return { ok: false, error: 'minValue must be numeric' };
  if (maxValue !== undefined && maxValue === null) return { ok: false, error: 'maxValue must be numeric' };
  if (minValue !== undefined && maxValue !== undefined && minValue >= maxValue) {
    return { ok: false, error: 'minValue must be smaller than maxValue' };
  }

  const packetThreshold = body.packetThreshold !== undefined ? asNumber(body.packetThreshold) : undefined;
  const durationMinutes = body.durationMinutes !== undefined ? asNumber(body.durationMinutes) : undefined;
  if (packetThreshold !== undefined && (!Number.isInteger(packetThreshold) || packetThreshold < 1)) {
    return { ok: false, error: 'packetThreshold must be an integer >= 1' };
  }
  if (durationMinutes !== undefined && (!Number.isInteger(durationMinutes) || durationMinutes < 0)) {
    return { ok: false, error: 'durationMinutes must be an integer >= 0' };
  }

  const severity = body.severity !== undefined ? String(body.severity).toUpperCase() : undefined;
  if (severity !== undefined && !VALID_SEVERITIES.includes(severity)) {
    return { ok: false, error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}` };
  }

  const triggerMode = body.triggerMode !== undefined ? String(body.triggerMode).toUpperCase() : undefined;
  if (triggerMode !== undefined && !VALID_TRIGGER_MODES.includes(triggerMode)) {
    return { ok: false, error: `triggerMode must be one of: ${VALID_TRIGGER_MODES.join(', ')}` };
  }

  // DURATION_ONLY requires duration_minutes > 0; PACKET_ONLY requires packet_threshold >= 1
  const effectiveTriggerMode = triggerMode ?? (isUpdate ? undefined : 'BOTH');
  if (effectiveTriggerMode === 'DURATION_ONLY') {
    const dm = durationMinutes ?? (isUpdate ? undefined : 0);
    if (dm !== undefined && dm === 0) {
      return { ok: false, error: 'durationMinutes must be > 0 when triggerMode is DURATION_ONLY' };
    }
  }

  return {
    ok: true,
    value: {
      deviceId:        body.deviceId,
      metricName:      body.metricName,
      minValue,
      maxValue,
      packetThreshold,
      durationMinutes,
      severity:        severity ?? (isUpdate ? undefined : 'HIGH'),
      enabled:         body.enabled,
      triggerMode:     triggerMode ?? (isUpdate ? undefined : 'BOTH')
    }
  };
}

function validateEscalationPayload(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Payload must be an object' };
  }
  const required = ['ruleId', 'level', 'escalateAfterMinutes', 'notifyVia', 'notifyTo'];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null || body[field] === '') {
      return { ok: false, error: `${field} is required` };
    }
  }
  const level = asNumber(body.level);
  const escalateAfterMinutes = asNumber(body.escalateAfterMinutes);
  if (!Number.isInteger(level) || level < 0) return { ok: false, error: 'level must be integer >= 0' };
  if (!Number.isInteger(escalateAfterMinutes) || escalateAfterMinutes < 1) {
    return { ok: false, error: 'escalateAfterMinutes must be integer >= 1' };
  }
  const VALID_NOTIFY_CHANNELS = ['EMAIL'];
  const notifyVia = String(body.notifyVia).toUpperCase();
  if (!VALID_NOTIFY_CHANNELS.includes(notifyVia)) {
    return { ok: false, error: `notifyVia must be one of: ${VALID_NOTIFY_CHANNELS.join(', ')}` };
  }
  if (notifyVia === 'EMAIL') {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.notifyTo)) {
      return { ok: false, error: 'notifyTo must be a valid email address for EMAIL notifications' };
    }
  }
  return {
    ok: true,
    value: {
      ruleId: Number(body.ruleId),
      level,
      escalateAfterMinutes,
      notifyVia,
      notifyTo: String(body.notifyTo)
    }
  };
}

module.exports = {
  validateTelemetryPayload,
  validateRulePayload,
  validateEscalationPayload
};
