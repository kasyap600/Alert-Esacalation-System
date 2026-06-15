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

function validateRulePayload(body, isUpdate = false) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Payload must be an object' };
  }
  const required = ['deviceId', 'metricName', 'minValue', 'maxValue'];
  if (!isUpdate) {
    for (const field of required) {
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
  return {
    ok: true,
    value: {
      deviceId: body.deviceId,
      metricName: body.metricName,
      minValue,
      maxValue,
      packetThreshold,
      durationMinutes,
      severity: body.severity || 'HIGH',
      enabled: body.enabled
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
  return {
    ok: true,
    value: {
      ruleId: Number(body.ruleId),
      level,
      escalateAfterMinutes,
      notifyVia: String(body.notifyVia).toUpperCase(),
      notifyTo: String(body.notifyTo)
    }
  };
}

module.exports = {
  validateTelemetryPayload,
  validateRulePayload,
  validateEscalationPayload
};
