const express = require('express');
const router = express.Router();

const rulesService = require('./rules.service');
const { validateRulePayload } = require('../validation/validators');

/**
 * GET /api/rules
 * Fetch all rules
 */
router.get('/', async (req, res) => {

  try {

    const rules = await rulesService.getAllRules();

    res.status(200).json(rules);

  } catch (error) {

    console.error('Error fetching rules:', error);

    res.status(500).json({
      error: 'Failed to fetch rules'
    });

  }

});


/**
 * GET /api/rules/:ruleId
 * Fetch single rule by ID
 */
router.get('/:ruleId', async (req, res) => {

  try {

    const { ruleId } = req.params;

    const rule = await rulesService.getRuleById(ruleId);

    if (!rule) {
      return res.status(404).json({
        error: 'Rule not found'
      });
    }

    res.status(200).json(rule);

  } catch (error) {

    console.error('Error fetching rule:', error);

    res.status(500).json({
      error: 'Failed to fetch rule'
    });

  }

});

/**
 * POST /api/rules
 * Create new rule
 */
router.post('/', async (req, res) => {

  try {

    const validation = validateRulePayload(req.body);
    if (!validation.ok) {
      return res.status(400).json({
        error: validation.error
      });
    }
    const rule = await rulesService.createRule(validation.value);

    res.status(201).json({
      message: 'Rule created successfully',
      rule
    });

  } catch (error) {

    console.error('Error creating rule:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        error: 'Rule already exists for this device and metric'
      });
    }

    res.status(500).json({
      error: 'Failed to create rule'
    });

  }

});



/**
 * PUT /api/rules/:ruleId
 * Update existing rule
 */
router.put('/:ruleId', async (req, res) => {

  try {

    const { ruleId } = req.params;

    const validation = validateRulePayload(req.body, true);
    if (!validation.ok) {
      return res.status(400).json({
        error: validation.error
      });
    }
    const rule = await rulesService.updateRule(ruleId, validation.value);

    if (!rule) {
      return res.status(404).json({
        error: 'Rule not found'
      });
    }

    res.json({
      message: 'Rule updated successfully',
      rule
    });

  } catch (error) {

    console.error('Error updating rule:', error);

    res.status(500).json({
      error: 'Failed to update rule'
    });

  }

});

/**
 * DELETE /api/rules/:ruleId
 */
router.delete('/:ruleId', async (req, res) => {
  try {
    const { ruleId } = req.params;
    const removed = await rulesService.deleteRule(ruleId);

    if (!removed) {
      return res.status(404).json({
        error: 'Rule not found'
      });
    }

    res.json({
      message: 'Rule deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting rule:', error);
    res.status(500).json({
      error: 'Failed to delete rule'
    });
  }
});

module.exports = router;