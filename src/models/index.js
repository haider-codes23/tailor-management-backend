/**
 * Model Registry
 *
 * Initializes all Sequelize models and sets up associations.
 * Other modules should import models from here:
 *   const { User } = require('../models');
 */

const sequelize = require("../config/database");

// Initialize models
const User = require("./User")(sequelize);

// Set up associations (will grow as more models are added)
// e.g., User.hasMany(Order); Order.belongsTo(User);

const db = {
    sequelize,
    User,
};

module.exports = db;
