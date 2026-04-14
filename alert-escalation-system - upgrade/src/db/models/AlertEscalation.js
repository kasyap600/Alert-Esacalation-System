const { DataTypes } = require('sequelize');
const sequelize = require('../index');

const AlertEscalation = sequelize.define('AlertEscalation', {
  alert_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  level: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  notified_at: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'alert_escalations',
  timestamps: false
});

module.exports = AlertEscalation;
