/**
 * InventoryMovement Model
 *
 * Audit trail for all stock changes. Every stock-in, stock-out,
 * reservation, and adjustment creates a movement record.
 *
 * Movement types:
 * - STOCK_IN:  Materials received from vendor
 * - STOCK_OUT: Materials consumed in production
 * - RESERVED:  Materials reserved for an order (not yet consumed)
 * - ADJUSTMENT: Manual correction for discrepancies
 * - ISSUE_READY_STOCK_TO_ORDER: Ready stock allocated to an order
 * - RETURN_READY_STOCK: Cancelled order returns ready stock
 */

const { DataTypes } = require("sequelize");

const MOVEMENT_TYPES = [
  "STOCK_IN",
  "STOCK_OUT",
  "RESERVED",
  "ADJUSTMENT",
  "ISSUE_READY_STOCK_TO_ORDER",
  "RETURN_READY_STOCK",
];

module.exports = (sequelize) => {
  const InventoryMovement = sequelize.define(
    "InventoryMovement",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      inventory_item_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      movement_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
          isIn: {
            args: [MOVEMENT_TYPES],
            msg: `Movement type must be one of: ${MOVEMENT_TYPES.join(", ")}`,
          },
        },
      },
      quantity: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
        get() {
          const val = this.getDataValue("quantity");
          return val !== null ? parseFloat(val) : 0;
        },
      },
      remaining_after: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
        get() {
          const val = this.getDataValue("remaining_after");
          return val !== null ? parseFloat(val) : 0;
        },
      },
      reference_type: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "ORDER, ORDER_ITEM, PURCHASE, ADJUSTMENT, PACKET",
      },
      reference_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      variant_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: "For variant items — which size variant was affected",
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      performed_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      transaction_date: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "inventory_movements",
      underscored: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  // ─── Associations ───────────────────────────────────────────────────

  InventoryMovement.associate = (models) => {
    InventoryMovement.belongsTo(models.InventoryItem, {
      foreignKey: "inventory_item_id",
      as: "inventory_item",
    });

    InventoryMovement.belongsTo(models.User, {
      foreignKey: "performed_by",
      as: "performer",
    });
  };

  // ─── Constants ──────────────────────────────────────────────────────

  InventoryMovement.MOVEMENT_TYPES = MOVEMENT_TYPES;

  return InventoryMovement;
};