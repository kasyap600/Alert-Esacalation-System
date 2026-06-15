const { Rule } = require('../db/models');

const ruleMap = new Map();

async function loadRules() {
  const rules = await Rule.findAll({ where: { enabled: true } });

  ruleMap.clear();

  for (const rule of rules) {
    const key = `${rule.device_id}:${rule.metric_name}`;
    ruleMap.set(key, rule);
  }

  console.log(`✅ Loaded ${ruleMap.size} rules into memory`);
}

function getRule(device_id, parameter) {
  const key = `${device_id}:${parameter}`;
  return ruleMap.get(key);
}

module.exports = {
  loadRules,
  getRule
};
