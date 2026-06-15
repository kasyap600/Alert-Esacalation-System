const express = require('express');
const router = express.Router();
const rulesService = require('../rules/rules.service');
const { validateTelemetryPayload } = require('../validation/validators');
const logger = require('../utils/logger');

router.post('/ingest', async (req, res) => {
  try {
    const validation = validateTelemetryPayload(req.body);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }
    const { deviceId, metrics, timestamp, packetId } = validation.value;
    const queuedPacketId = await rulesService.enqueueTelemetry({
      deviceId,
      metrics,
      timestamp,
      packetId
    });
    return res.json({
      message: 'Telemetry accepted',
      packetId: queuedPacketId,
      processedMetrics: Object.keys(metrics || {})
    });
  } catch (error) {
    logger.error('ingestion_error', { error: error.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;