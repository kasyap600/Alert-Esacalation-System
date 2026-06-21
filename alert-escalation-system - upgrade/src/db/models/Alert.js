const { DataTypes } = require('sequelize');
const sequelize = require('../index');

const Alert = sequelize.define('Alert', {

  rule_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'rules', key: 'id' },
    onDelete: 'SET NULL'
  },

  device_id: {
    type: DataTypes.STRING,
    allowNull: false
  },

  metric_name: {
    type: DataTypes.STRING(50),
    allowNull: false
  },

  current_value: {
    type: DataTypes.DOUBLE
  },

  min_value: {
    type: DataTypes.DOUBLE
  },

  max_value: {
    type: DataTypes.DOUBLE
  },

  severity: {
    type: DataTypes.STRING(20)
  },

  status: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'OPEN'
  },

  current_level: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },

  first_triggered_at: {
    type: DataTypes.DATE
  },

  triggered_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },

  acknowledged_at: {
    type: DataTypes.DATE
  },

  resolved_at: {
    type: DataTypes.DATE
  },

  acknowledged_by: {
    type: DataTypes.STRING(100)
  },

  last_updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }

}, {
  tableName: 'alerts',
  timestamps: false,
  indexes: [
    { fields: ['status', 'current_level'] },
    { fields: ['device_id', 'metric_name'] },
    { fields: ['rule_id'] },
    { fields: ['triggered_at'] },
    { fields: ['status'] }
  ]
});

module.exports = Alert;