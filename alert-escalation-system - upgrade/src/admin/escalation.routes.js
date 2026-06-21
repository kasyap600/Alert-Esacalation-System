const express = require('express');
const router = express.Router();
const EscalationPolicy = require('../db/models/EscalationPolicy');
const Rule = require('../db/models/Rule');
const { validateEscalationPayload } = require('../validation/validators');
const logger = require('../utils/logger');

// GET /api/admin/escalation-policies  optional ?ruleId=123
router.get('/escalation-policies', async (req, res) => {
  try {
    const { ruleId } = req.query;
    const where = {};
    if (ruleId !== undefined && ruleId !== '') {
      const id = parseInt(ruleId, 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'ruleId must be a positive integer' });
      }
      where.rule_id = id;
    }
    const policies = await EscalationPolicy.findAll({
      where,
      order: [['rule_id', 'ASC'], ['level', 'ASC']]
    });
    return res.status(200).json(policies);
  } catch (err) {
    logger.error('escalation_list_failed', { error: err.message });
    return res.status(500).json({ error: 'Failed to list escalation policies' });
  }
});

// POST /api/admin/escalation-policy
router.post('/escalation-policy', async (req, res) => {
  try {
    const validation = validateEscalationPayload(req.body);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }
    const { ruleId, level, escalateAfterMinutes, notifyVia, notifyTo } = validation.value;

    const rule = await Rule.findByPk(ruleId);
    if (!rule) return res.status(404).json({ error: 'Rule not found' });

    const existing = await EscalationPolicy.findOne({ where: { rule_id: ruleId, level } });
    if (existing) {
      return res.status(409).json({ error: `Level ${level} already exists for this rule` });
    }

    const policy = await EscalationPolicy.create({
      rule_id: ruleId,
      level,
      escalate_after_minutes: escalateAfterMinutes,
      notify_via: notifyVia,
      notify_to: notifyTo
    });

    return res.status(201).json({ message: 'Escalation level created successfully', policy });
  } catch (err) {
    logger.error('escalation_create_failed', { error: err.message });
    return res.status(500).json({ error: 'Failed to create escalation policy' });
  }
});

// PUT /api/admin/escalation-policy/:id
router.put('/escalation-policy/:id', async (req, res) => {
  try {
    const policy = await EscalationPolicy.findByPk(req.params.id);
    if (!policy) return res.status(404).json({ error: 'Escalation policy not found' });

    const { escalateAfterMinutes, notifyVia, notifyTo } = req.body;

    if (escalateAfterMinutes !== undefined) {
      const mins = parseInt(escalateAfterMinutes, 10);
      if (!Number.isInteger(mins) || mins < 1) {
        return res.status(400).json({ error: 'escalateAfterMinutes must be an integer >= 1' });
      }
      policy.escalate_after_minutes = mins;
    }

    const VALID_NOTIFY_CHANNELS = ['EMAIL'];
    if (notifyVia !== undefined) {
      const channel = String(notifyVia).toUpperCase();
      if (!VALID_NOTIFY_CHANNELS.includes(channel)) {
        return res.status(400).json({ error: `notifyVia must be one of: ${VALID_NOTIFY_CHANNELS.join(', ')}` });
      }
      policy.notify_via = channel;
    }

    if (notifyTo !== undefined) {
      const channel = notifyVia ? String(notifyVia).toUpperCase() : policy.notify_via;
      if (channel === 'EMAIL') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(notifyTo)) {
          return res.status(400).json({ error: 'notifyTo must be a valid email address for EMAIL notifications' });
        }
      }
      policy.notify_to = String(notifyTo);
    }

    await policy.save();
    return res.json({ message: 'Escalation policy updated', policy });
  } catch (err) {
    logger.error('escalation_update_failed', { error: err.message });
    return res.status(500).json({ error: 'Failed to update escalation policy' });
  }
});

// DELETE /api/admin/escalation-policy/:id
router.delete('/escalation-policy/:id', async (req, res) => {
  try {
    const policy = await EscalationPolicy.findByPk(req.params.id);
    if (!policy) return res.status(404).json({ error: 'Escalation policy not found' });

    await policy.destroy();
    return res.json({ message: 'Escalation policy deleted' });
  } catch (err) {
    logger.error('escalation_delete_failed', { error: err.message });
    return res.status(500).json({ error: 'Failed to delete escalation policy' });
  }
});

module.exports = router;
