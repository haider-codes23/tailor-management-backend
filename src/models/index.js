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
const InventoryItem = require("./InventoryItem")(sequelize);
const InventoryItemVariant = require("./InventoryItemVariant")(sequelize);
const InventoryMovement = require("./InventoryMovement")(sequelize);

// Set up associations (will grow as more models are added)
// e.g., User.hasMany(Order); Order.belongsTo(User);

const db = {
    sequelize,
    User,
    InventoryItem,
    InventoryItemVariant,
    InventoryMovement,
};

// ─── Set up associations ────────────────────────────────────────────────────
// Call .associate() on each model that defines it, passing the full db object
// so models can reference each other without circular dependency issues.
Object.values(db).forEach((model) => {
  if (model.associate) {
    model.associate(db);
  }
});

module.exports = db;
