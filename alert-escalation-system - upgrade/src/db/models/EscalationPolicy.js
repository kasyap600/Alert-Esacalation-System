const { DataTypes } = require('sequelize');
const sequelize = require('../index');

const EscalationPolicy = sequelize.define('EscalationPolicy', {
  rule_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'rules', key: 'id' },
    onDelete: 'CASCADE'
  },
  level: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  escalate_after_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  notify_via: {
    type: DataTypes.STRING
  },
  notify_to: {
    type: DataTypes.STRING
  }
}, {
  tableName: 'escalation_policies',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['rule_id', 'level']
    }
  ]
});

module.exports = EscalationPolicy;
