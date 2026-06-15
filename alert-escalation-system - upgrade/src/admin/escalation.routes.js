const express = require('express');
const router = express.Router();
const EscalationPolicy = require('../db/models/EscalationPolicy');
const Rule = require('../db/models/Rule');
const { validateEscalationPayload } = require('../validation/validators');

/**
 * GET /api/admin/escalation-policies
 * Optional query: ?ruleId=123
 */
router.get('/escalation-policies', async (req, res) => {
  try {
    const { ruleId } = req.query;
    const where =
      ruleId !== undefined && ruleId !== ''
        ? { rule_id: Number(ruleId) }
        : undefined;

    const policies = await EscalationPolicy.findAll({
      where,
      order: [
        ['rule_id', 'ASC'],
        ['level', 'ASC']
      ]
    });

    return res.status(200).json(policies);
  } catch (err) {
    console.error('ESCALATION LIST ERROR:', err.message);
    return res.status(500).json({ error: 'Failed to list escalation policies' });
  }
});

router.post('/escalation-policy', async (req, res) => {
  try {
    const validation = validateEscalationPayload(req.body);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }
    const { ruleId, level, escalateAfterMinutes, notifyVia, notifyTo } = validation.value;

    // ✅ Check if rule exists
    const rule = await Rule.findByPk(ruleId);
    if (!rule) {
      return res.status(404).json({
        error: 'Rule not found'
      });
    }

    // ✅ Prevent duplicate level for same rule
    const existingLevel = await EscalationPolicy.findOne({
      where: {
        rule_id: ruleId,
        level
      }
    });

    if (existingLevel) {
      return res.status(409).json({
        error: `Level ${level} already exists for this rule`
      });
    }

    // ✅ Create escalation level
    const policy = await EscalationPolicy.create({
      rule_id: ruleId,
      level,
      escalate_after_minutes: escalateAfterMinutes,
      notify_via: notifyVia,
      notify_to: notifyTo
    });

    return res.status(201).json({
      message: 'Escalation level created successfully',
      policy
    });

  } catch (err) {
    console.error('ESCALATION ERROR:', err.message);
    console.error('DB ERROR:', err.original);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;