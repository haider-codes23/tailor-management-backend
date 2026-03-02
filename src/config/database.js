/**
 * Sequelize Database Configuration
 *
 * This file is used by both:
 * 1. The app at runtime (sequelize instance)
 * 2. The Sequelize CLI for migrations/seeds (via .sequelizerc)
 */

const { Sequelize } = require("sequelize");
const env = require("./environment");

// Create Sequelize instance
const sequelize = new Sequelize(env.db.name, env.db.user, env.db.password, {
  host: env.db.host,
  port: env.db.port,
  dialect: env.db.dialect,
  logging: env.db.logging ? (msg) => console.log(`📦 SQL: ${msg}`) : false,

  pool: {
    max: 10, // Max connections in pool
    min: 2, // Min connections kept alive
    acquire: 30000, // Max time (ms) to get connection before throwing error
    idle: 10000, // Max time (ms) a connection can be idle before being released
  },

  define: {
    timestamps: true, // Auto-add createdAt/updatedAt
    underscored: true, // Use snake_case column names (created_at instead of createdAt)
    freezeTableName: true, // Don't pluralize table names
  },
});

module.exports = sequelize;