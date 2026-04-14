const { DataTypes } = require('sequelize');
const sequelize = require('../index');

const Device = sequelize.define('Device', {

  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },

  device_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: {
      notEmpty: true
    }
  },

  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: true
    }
  },

  location: {
    type: DataTypes.STRING(100),
    allowNull: true
  },

  device_type: {
    type: DataTypes.STRING(100),
    allowNull: true
  },

  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }

}, {
  tableName: 'devices',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      unique: true,
      fields: ['device_id']
    }
  ]
});

module.exports = Device;