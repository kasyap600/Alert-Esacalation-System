require('dotenv').config();
const express = require('express');

const cors = require("cors");
const app = express();

/* ---------- MIDDLEWARE ---------- */

app.use(cors());              // enable CORS FIRST
app.use(express.json());      // parse JSON

/* ------------------ ROUTES ------------------ */

// Health check route
app.get('/health', (req, res) => {
  res.send('Alert Escalation System is running');
});

// Ingestion routes
const ingestionRoutes = require('./ingestion/ingestion.routes');
app.use('/api', ingestionRoutes);

/* ------------------ DATABASE ------------------ */

const sequelize = require('./db');
const Device = require('./db/models/Device');
const Rule = require('./db/models/Rule');
require('./ingestion/redis');
/* ------------------ CONNECT DB & START SERVER ------------------ */

sequelize.authenticate()
  .then(async () => {
    console.log('PostgreSQL connected successfully');

    // Fetch devices and rules (merged logic)
    const devices = await Device.findAll();
    const rules = await Rule.findAll();

    console.log('Devices count:', devices.length);
    console.log('Rules count:', rules.length);
    console.log('Device IDs:', devices.map(d => d.device_id));
    console.log('Rule parameters:', rules.map(r => r.parameter));

    // Start server only after DB connection
    app.listen(5000, () => {
      console.log('Server running on port 5000');
    });
  })
  .catch(err => {
    console.error('DB connection failed:', err);
  });
  const { loadRules } = require('./rules/ruleCache');
  (async () => {
    await loadRules();
  })();

const adminDeviceRoutes = require('./admin/device.routes');
const adminRuleRoutes = require('./admin/rule.routes');

app.use('/api/admin', adminDeviceRoutes);
app.use('/api/admin', adminRuleRoutes);
//require('./scheduler/alert.scheduler');
require('./scheduler/escalation.scheduler');
app.use('/api/admin', require('./admin/escalation.routes'));
app.use('/api/alerts', require('./alerts/alert.routes'));


//Fetch all rules
const rulesController = require('./rules/rules.controller');
app.use('/api/rules', rulesController);

// Device management routes
const deviceRoutes = require('./devices/device.routes');
app.use('/api/devices', deviceRoutes);

// Start telemetry worker
const telemetryWorker = require('./ingestion/telemetry.worker');
telemetryWorker();