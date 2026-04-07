/**
 * Model Registry
 *
 * Initializes all Sequelize models and sets up associations.
 * Other modules should import models from here:
 *   const { User, Product, Order, OrderItem } = require('../models');
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

// ── Phase 8: Orders ──────────────────────────────────────────────────
const Order = require("./Order")(sequelize);
const OrderItem = require("./OrderItem")(sequelize);
const OrderItemSection = require("./OrderItemSection")(sequelize);
const OrderActivity = require("./OrderActivity")(sequelize);

// ── Phase 8G: Shopify Integration ────────────────────────────────────
const ShopifySyncLog = require("./ShopifySyncLog")(sequelize);

// ── Phase 9: Procurement ─────────────────────────────────────────────
const ProcurementDemand = require("./ProcurementDemand")(sequelize);

// ── Phase 10: Packets ────────────────────────────────────────────────
const Packet = require("./Packet")(sequelize);
const PacketItem = require("./PacketItem")(sequelize);

// ── Phase 12: Production ─────────────────────────────────────────────
const ProductionTask = require("./ProductionTask")(sequelize);
const ProductionAssignment = require("./ProductionAssignment")(sequelize);

// ── Phase 13: QA & Sales Approval ────────────────────────────────
const QaReview = require("./QaReview")(sequelize);
const ClientApproval = require("./ClientApproval")(sequelize);

// ── Phase 16: Notifications ──────────────────────────────────────────
const Notification = require("./Notification")(sequelize);

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
  Order,
  OrderItem,
  OrderItemSection,
  OrderActivity,
  ShopifySyncLog,
  ProcurementDemand,
  Packet,
  PacketItem,
  ProductionTask,
  ProductionAssignment,
  QaReview,
  ClientApproval,
  Notification,
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