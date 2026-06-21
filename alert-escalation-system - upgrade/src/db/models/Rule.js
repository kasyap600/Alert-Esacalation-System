const { DataTypes } = require('sequelize');
const sequelize = require('../index');

const Rule = sequelize.define('Rule', {

  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  device_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },

  metric_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },

  min_value: {
    type: DataTypes.DOUBLE,
    allowNull: false,
    validate: {
      isFloat: true
    }
  },

  max_value: {
    type: DataTypes.DOUBLE,
    allowNull: false,
    validate: {
      isFloat: true
    }
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
  },

  trigger_mode: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'BOTH',
    validate: {
      isIn: [['PACKET_ONLY', 'DURATION_ONLY', 'BOTH']]
    }
  }

}, {
  tableName: 'rules',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['device_id', 'metric_name']
    },
    {
      fields: ['enabled', 'device_id']
    }
  ]
});

module.exports = Rule;