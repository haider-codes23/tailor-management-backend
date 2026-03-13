/**
 * OrderItem Model
 *
 * A single line item within an order. Each item references a Product,
 * carries its own status through the workflow, and tracks per-section
 * progress via the section_statuses JSONB and the related
 * OrderItemSection rows.
 *
 * Key features:
 *   - Independent status tracking per item (different items can be at
 *     different workflow stages)
 *   - JSONB fields for customisation data (style, color, fabric)
 *   - section_statuses JSONB for quick reads; OrderItemSection rows
 *     for querying
 *   - Supports both STANDARD and CUSTOM size types
 *   - Custom BOM stored in JSONB for bespoke (CUSTOM) orders
 *   - Customer form data stored directly on item (order_form, order_form_versions)
 *
 * Maps to the `order_items` table created in migration 09.
 */

const { DataTypes } = require("sequelize");
const {
  ORDER_ITEM_STATUS,
  ORDER_ITEM_STATUS_VALUES,
  SIZE_TYPE,
  FULFILLMENT_SOURCE_VALUES,
} = require("../constants/order");

module.exports = (sequelize) => {
  const OrderItem = sequelize.define(
    "OrderItem",
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
      product_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      product_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: { notEmpty: { msg: "Product name is required" } },
      },
      product_sku: { type: DataTypes.STRING(100), allowNull: true },
      product_image: { type: DataTypes.TEXT, allowNull: true },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        validate: { min: { args: [1], msg: "Quantity must be at least 1" } },
      },
      unit_price: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        get() {
          const v = this.getDataValue("unit_price");
          return v !== null ? parseFloat(v) : 0;
        },
      },

      // ── Size ────────────────────────────────────────────────────────
      size_type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: SIZE_TYPE.STANDARD,
      },
      size: { type: DataTypes.STRING(50), allowNull: true },

      // ── Status & Fulfillment ────────────────────────────────────────
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: ORDER_ITEM_STATUS.RECEIVED,
      },
      fulfillment_source: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      bom_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },

      // ── Customisation (JSONB) ───────────────────────────────────────
      style: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: { type: "original", details: {}, attachments: [], image: null },
      },
      color: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: { type: "original", details: "", attachments: [], image: null },
      },
      fabric: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: { type: "original", details: "", attachments: [], image: null },
      },

      // ── Measurements ────────────────────────────────────────────────
      height_range: { type: DataTypes.STRING(50), allowNull: true },
      measurement_categories: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      measurements: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },

      // ── Form tracking ──────────────────────────────────────────────
      order_form_generated: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      order_form_approved: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      order_form: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: null,
        comment: "Current form version object",
      },
      order_form_versions: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: "Array of all form version objects",
      },
      garment_notes: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: null,
        comment: "Per-garment notes: { shirt: {...}, bottom: {...}, dupatta: {...} }",
      },

      // ── What's included ────────────────────────────────────────────
      included_items: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: "[{piece: 'shirt', price: 45000}]",
      },
      selected_add_ons: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: "[{piece: 'dupatta', price: 10000}]",
      },

      // ── Section-level status tracking ──────────────────────────────
      section_statuses: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: "Per-section status: {shirt: {status, updatedAt}, dupatta: {...}}",
      },

      // ── Custom BOM (for CUSTOM size) ───────────────────────────────
      custom_bom: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "Custom BOM created by fabrication for non-standard sizes",
      },

      modesty: { type: DataTypes.BOOLEAN, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: "order_items",
      timestamps: true,
      underscored: true,
    }
  );

  // ─── Helpers ──────────────────────────────────────────────────────

  /** Computed line total */
  OrderItem.prototype.getLineTotal = function () {
    return this.quantity * (parseFloat(this.unit_price) || 0);
  };

  /** Extract section piece names from included_items + selected_add_ons */
  OrderItem.prototype.getSectionNames = function () {
    const names = [];
    (this.included_items || []).forEach((i) => names.push(i.piece));
    (this.selected_add_ons || []).forEach((a) => names.push(a.piece));
    return names;
  };

  // ─── Associations ─────────────────────────────────────────────────

  OrderItem.associate = (models) => {
    OrderItem.belongsTo(models.Order, {
      foreignKey: "order_id",
      as: "order",
    });

    OrderItem.belongsTo(models.Product, {
      foreignKey: "product_id",
      as: "product",
    });

    OrderItem.belongsTo(models.Bom, {
      foreignKey: "bom_id",
      as: "bom",
    });

    OrderItem.hasMany(models.OrderItemSection, {
      foreignKey: "order_item_id",
      as: "sections",
    });

    OrderItem.hasMany(models.OrderActivity, {
      foreignKey: "order_item_id",
      as: "activities",
    });
  };

  return OrderItem;
};