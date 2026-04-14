const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  'alert_escalation_db',
  'postgres',
  '7007', // your password
  {
    host: 'localhost',
    dialect: 'postgres',
    logging: false,
  }
);

module.exports = sequelize;
