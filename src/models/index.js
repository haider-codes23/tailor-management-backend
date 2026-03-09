/**
 * Model Registry
 *
 * Initializes all Sequelize models and sets up associations.
 * Other modules should import models from here:
 *   const { User, Product, Bom } = require('../models');
 */

const sequelize = require("../config/database");

// ── Phase 3: Auth ─────────────────────────────────────────────────────
const User = require("./User")(sequelize);

// ── Phase 5: Inventory ────────────────────────────────────────────────
const InventoryItem = require("./InventoryItem")(sequelize);
const InventoryItemVariant = require("./InventoryItemVariant")(sequelize);
const InventoryMovement = require("./InventoryMovement")(sequelize);

// ── Phase 6: Products, BOM & Measurement Charts ──────────────────────
const Product = require("./Product")(sequelize);
const Bom = require("./Bom")(sequelize);
const BomItem = require("./BomItem")(sequelize);
const ProductSizeChartRow = require("./ProductSizeChartRow")(sequelize);
const ProductHeightChartRow = require("./ProductHeightChartRow")(sequelize);

const db = {
  sequelize,
  User,
  InventoryItem,
  InventoryItemVariant,
  InventoryMovement,
  Product,
  Bom,
  BomItem,
  ProductSizeChartRow,
  ProductHeightChartRow,
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