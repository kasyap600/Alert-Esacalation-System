
const express = require('express');
const router = express.Router();
const rulesService = require('../rules/rules.service');
const { validateRulePayload } = require('../validation/validators');

router.post('/rules', async (req, res) => {
  try {
    const validation = validateRulePayload(req.body);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.error });
    }
    const rule = await rulesService.createRule(validation.value);

    res.status(201).json({
      message: 'Rule created successfully',
      rule
    });

  } catch (err) {
    console.error('RULE ERROR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

