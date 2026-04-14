// src/ingestion/mqttHandler.js

const ruleService = require('../rules/rule.service');

mqttClient.on('message', async (topic, message) => {
  try {
    const packet = JSON.parse(message.toString());
    ruleService.evaluate(packet); // don't await here
  } catch (err) {
    console.error("Packet error:", err);
  }
});