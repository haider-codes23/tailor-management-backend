/**
 * InventoryItemVariant Model
 *
 * Per-size stock tracking for READY_STOCK and READY_SAMPLE items.
 * Each variant has its own stock level, reorder threshold, and optional price.
 *
 * Example: GOLDESS dress has variants for S, M, L, XL — each with independent stock.
 */

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const InventoryItemVariant = sequelize.define(
    "InventoryItemVariant",
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
      size: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
          notEmpty: { msg: "Size is required" },
        },
      },
      sku: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      remaining_stock: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
        defaultValue: 0,
        get() {
          const val = this.getDataValue("remaining_stock");
          return val !== null ? parseFloat(val) : 0;
        },
      },
      reorder_level: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
        defaultValue: 0,
        get() {
          const val = this.getDataValue("reorder_level");
          return val !== null ? parseFloat(val) : 0;
        },
      },
      reorder_amount: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: true,
        defaultValue: 0,
        get() {
          const val = this.getDataValue("reorder_amount");
          return val !== null ? parseFloat(val) : 0;
        },
      },
      price: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        get() {
          const val = this.getDataValue("price");
          return val !== null ? parseFloat(val) : null;
        },
      },
      image_url: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "inventory_item_variants",
      underscored: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  // ─── Custom toJSON ──────────────────────────────────────────────────

  InventoryItemVariant.prototype.toJSON = function () {
    const values = { ...this.get() };
    // Frontend expects variant_id — alias the UUID id
    values.variant_id = values.id;
    return values;
  };

  // ─── Associations ───────────────────────────────────────────────────

  InventoryItemVariant.associate = (models) => {
    InventoryItemVariant.belongsTo(models.InventoryItem, {
      foreignKey: "inventory_item_id",
      as: "inventory_item",
    });
  };

  return InventoryItemVariant;
};