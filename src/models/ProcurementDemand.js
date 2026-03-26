/**
 * ProcurementDemand Model
 *
 * Tracks material shortages discovered during inventory checks.
 * Each demand links an order item section to a specific inventory item
 * that is short, with quantities and status tracking.
 *
 * Lifecycle: OPEN → ORDERED → RECEIVED (or CANCELLED)
 *
 * Maps to the `procurement_demands` table created in migration 14.
 */

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProcurementDemand = sequelize.define(
    "ProcurementDemand",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      order_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      order_item_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      inventory_item_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      inventory_item_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      inventory_item_sku: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      required_qty: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
        get() {
          const v = this.getDataValue("required_qty");
          return v !== null ? parseFloat(v) : 0;
        },
      },
      available_qty: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
        defaultValue: 0,
        get() {
          const v = this.getDataValue("available_qty");
          return v !== null ? parseFloat(v) : 0;
        },
      },
      shortage_qty: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
        get() {
          const v = this.getDataValue("shortage_qty");
          return v !== null ? parseFloat(v) : 0;
        },
      },
      unit: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      affected_section: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Which section this shortage affects: shirt, dupatta, pouch, etc.",
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "OPEN",
        validate: {
          isIn: {
            args: [["OPEN", "ORDERED", "RECEIVED", "FULFILLED", "CANCELLED"]],
            msg: "Status must be one of: OPEN, ORDERED, RECEIVED, FULFILLED, CANCELLED",
          },
        },
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "procurement_demands",
      timestamps: true,
      underscored: true,
    }
  );

  // ─── Associations ─────────────────────────────────────────────────

  ProcurementDemand.associate = (models) => {
    ProcurementDemand.belongsTo(models.Order, {
      foreignKey: "order_id",
      as: "order",
    });

    ProcurementDemand.belongsTo(models.OrderItem, {
      foreignKey: "order_item_id",
      as: "orderItem",
    });

    ProcurementDemand.belongsTo(models.InventoryItem, {
      foreignKey: "inventory_item_id",
      as: "inventoryItem",
    });
  };

  // ─── Status constants ─────────────────────────────────────────────

  ProcurementDemand.STATUS = {
    OPEN: "OPEN",
    ORDERED: "ORDERED",
    RECEIVED: "RECEIVED",
    FULFILLED: "FULFILLED",
    CANCELLED: "CANCELLED",
  };

  return ProcurementDemand;
};