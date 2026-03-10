/**
 * InventoryItem Model
 *
 * Sequelize model for the `inventory_items` table.
 * Supports 6 categories: FABRIC, RAW_MATERIAL, MULTI_HEAD,
 * ADDA_MATERIAL, READY_STOCK, READY_SAMPLE.
 *
 * READY_STOCK and READY_SAMPLE items use the `has_variants` flag
 * and associated InventoryItemVariant records for per-size stock tracking.
 * Simple items (FABRIC, etc.) use the `remaining_stock` field directly.
 */

const { DataTypes } = require("sequelize");
const { INVENTORY_CATEGORIES } = require("../constants/inventory");

module.exports = (sequelize) => {
  const InventoryItem = sequelize.define(
    "InventoryItem",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
          notEmpty: { msg: "Name is required" },
        },
      },
      sku: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: {
          msg: "SKU already in use",
        },
        validate: {
          notEmpty: { msg: "SKU is required" },
        },
      },
      category: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
          isIn: {
            args: [INVENTORY_CATEGORIES],
            msg: `Category must be one of: ${INVENTORY_CATEGORIES.join(", ")}`,
          },
        },
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      unit: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
          notEmpty: { msg: "Unit is required" },
        },
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
      min_stock_level: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
        defaultValue: 0,
        get() {
          const val = this.getDataValue("min_stock_level");
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
      unit_price: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0,
        get() {
          const val = this.getDataValue("unit_price");
          return val !== null ? parseFloat(val) : 0;
        },
      },
      vendor_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      vendor_contact: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      rack_location: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      image_url: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      linked_product_id: {
        type: DataTypes.UUID,
        allowNull: true,
        comment: "Only for READY_STOCK — links to the finished product",
      },
      has_variants: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      notes: {
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
      tableName: "inventory_items",
      underscored: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  // ─── Virtual fields ─────────────────────────────────────────────────

  /**
   * Frontend uses `reorder_level` but DB column is `min_stock_level`.
   * We expose both names for compatibility.
   */
  InventoryItem.prototype.toJSON = function () {
    const values = { ...this.get() };

    // Alias min_stock_level → reorder_level for frontend compatibility
    values.reorder_level = values.min_stock_level;
    // reorder_amount is already named correctly in both DB and frontend

    // Compute total_stock and is_low_stock
    if (values.has_variants && values.variants && values.variants.length > 0) {
      values.total_stock = values.variants.reduce(
        (sum, v) => sum + parseFloat(v.remaining_stock || 0),
        0
      );
      values.is_low_stock = values.variants.some(
        (v) => parseFloat(v.remaining_stock || 0) < parseFloat(v.reorder_level || 0)
      );
    } else {
      values.total_stock = parseFloat(values.remaining_stock || 0);
      values.is_low_stock =
        parseFloat(values.remaining_stock || 0) < parseFloat(values.min_stock_level || 0);
    }

    return values;
  };

  // ─── Class methods ──────────────────────────────────────────────────

  /**
   * Find items below their reorder threshold.
   * For variant items, checks if ANY variant is below threshold.
   */
  InventoryItem.findLowStock = async function (includeVariants = true) {
    const { Op, literal } = require("sequelize");

    // Simple items: remaining_stock < min_stock_level
    const simpleCondition = {
      has_variants: false,
      is_active: true,
      remaining_stock: { [Op.lt]: literal('"InventoryItem"."min_stock_level"') },
    };

    const simpleItems = await InventoryItem.findAll({
      where: simpleCondition,
    });

    // Variant items: need to check via join
    let variantItems = [];
    if (includeVariants) {
      const InventoryItemVariant = sequelize.models.InventoryItemVariant;
      if (InventoryItemVariant) {
        variantItems = await InventoryItem.findAll({
          where: { has_variants: true, is_active: true },
          include: [
            {
              model: InventoryItemVariant,
              as: "variants",
              where: {
                remaining_stock: {
                  [Op.lt]: literal('"variants"."reorder_level"'),
                },
                is_active: true,
              },
              required: true, // INNER JOIN — only items with low-stock variants
            },
          ],
        });
      }
    }

    return [...simpleItems, ...variantItems];
  };

  // ─── Associations (called from models/index.js) ─────────────────────

  InventoryItem.associate = (models) => {
    // An inventory item has many variants (for READY_STOCK / READY_SAMPLE)
    InventoryItem.hasMany(models.InventoryItemVariant, {
      foreignKey: "inventory_item_id",
      as: "variants",
    });

    // An inventory item has many stock movements
    InventoryItem.hasMany(models.InventoryMovement, {
      foreignKey: "inventory_item_id",
      as: "movements",
    });

    // linked_product_id → Product (will be set up when Product model exists)
    InventoryItem.belongsTo(models.Product, {
      foreignKey: "linked_product_id",
      as: "linked_product",
    });
  };

  // ─── Constants ──────────────────────────────────────────────────────

  InventoryItem.CATEGORIES = INVENTORY_CATEGORIES;

  return InventoryItem;
};