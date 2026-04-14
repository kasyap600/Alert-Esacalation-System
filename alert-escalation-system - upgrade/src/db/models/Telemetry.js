const { DataTypes } = require('sequelize');
const sequelize = require('../index');

const Telemetry = sequelize.define('Telemetry', {
  id: {
    type: DataTypes.BIGINT,
    autoIncrement: true,
    primaryKey: true,
  },
  device_id: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  timestamp: {
    type: DataTypes.BIGINT,
    allowNull: false,
  },
  metrics: {
    type: DataTypes.JSONB,
    allowNull: false,
  }
}, {
  tableName: 'telemetry_data',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = Telemetry;