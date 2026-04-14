const { DataTypes } = require('sequelize');
const sequelize = require('../index');

const Rule = sequelize.define('Rule', {

  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  device_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },

  metric_name: {
    type: DataTypes.STRING,
    allowNull: false
  },

  min_value: {
    type: DataTypes.FLOAT,
    allowNull: false
  },

  max_value: {
    type: DataTypes.FLOAT,
    allowNull: false
  },

  packet_threshold: {
  type: DataTypes.INTEGER,
  allowNull: false,
  defaultValue: 3
  },

  duration_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  severity: {
    type: DataTypes.STRING
  },

  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }

}, {
  tableName: 'rules',
  timestamps: false // or true if you have created_at/updated_at
});

module.exports = Rule;