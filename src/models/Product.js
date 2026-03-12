/**
 * Product Model
 *
 * Represents a product in the catalog (e.g., a specific dress style).
 * Each product can have:
 *   - Multiple size-based BOMs (Bill of Materials)
 *   - Product-scoped measurement charts (size chart + height chart)
 *   - Linked READY_STOCK inventory items
 *   - Shopify integration fields
 *
 * Maps to the `products` table created in migration 02,
 * with measurement chart columns added in migration 07.
 */

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Product = sequelize.define(
    "Product",
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
          notEmpty: { msg: "Product name is required" },
        },
      },
      sku: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: { msg: "SKU is required" },
        },
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      category: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      images: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },

      // ── Pieces (product structure) ──────────────────────────────────
      product_items: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Main included pieces e.g. [{piece: "shirt", price: 45000}]',
      },
      add_ons: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Optional add-on pieces e.g. [{piece: "dupatta", price: 10000}]',
      },

      // ── Pricing (computed from product_items + add_ons) ─────────────
      subtotal: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        get() {
          const v = this.getDataValue("subtotal");
          return v !== null ? parseFloat(v) : 0;
        },
      },
      discount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        get() {
          const v = this.getDataValue("discount");
          return v !== null ? parseFloat(v) : 0;
        },
      },
      total_price: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        get() {
          const v = this.getDataValue("total_price");
          return v !== null ? parseFloat(v) : 0;
        },
      },

      // ── Shopify integration ─────────────────────────────────────────
      shopify_product_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      shopify_variant_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },

      // ── Measurement chart config (added by migration 07) ───────────
      has_size_chart: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      has_height_chart: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      enabled_size_fields: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      enabled_height_fields: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },

      // ── Soft delete / status ────────────────────────────────────────
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: "products",
      timestamps: true,
      underscored: true, // created_at, updated_at
    }
  );

  // ─── Virtual: all pieces (main + add-ons) ───────────────────────────

  /**
   * Returns an array of all piece names for this product.
   * Used by BOM creation to auto-populate sections.
   */
  Product.prototype.getAllPieces = function () {
    const main = (this.product_items || []).map((i) => i.piece);
    const addOns = (this.add_ons || []).map((a) => a.piece);
    return [...main, ...addOns];
  };

  /**
   * Compute subtotal from product_items + add_ons prices.
   */
  Product.prototype.getSubtotal = function () {
    const itemsTotal = (this.product_items || []).reduce(
      (sum, i) => sum + (parseFloat(i.price) || 0),
      0
    );
    const addOnsTotal = (this.add_ons || []).reduce(
      (sum, a) => sum + (parseFloat(a.price) || 0),
      0
    );
    return itemsTotal + addOnsTotal;
  };

  Product.prototype.toJSON = function () {
    const values = { ...this.get() };
    values.primary_image =
      values.images && values.images.length > 0 ? values.images[0] : null;
    
    // Frontend compatibility: MSW used "active", backend uses "is_active"
    values.active = values.is_active;
    // Ensure pricing fields are always present (matches MSW mock structure)
    // If DB values are 0 but JSONB has prices, recompute on the fly as fallback
    if (values.total_price === 0 && (values.product_items?.length || values.add_ons?.length)) {
      const computed = this.getSubtotal();
      if (computed > 0) {
        values.subtotal = computed;
        values.total_price = computed - (values.discount || 0);
      }
    }
    return values;
  };

  // ─── Associations (called from models/index.js) ─────────────────────

  Product.associate = (models) => {
    // A product has many BOMs (versioned, per size)
    Product.hasMany(models.Bom, {
      foreignKey: "product_id",
      as: "boms",
    });

    // A product has many size chart rows
    Product.hasMany(models.ProductSizeChartRow, {
      foreignKey: "product_id",
      as: "sizeChartRows",
    });

    // A product has many height chart rows
    Product.hasMany(models.ProductHeightChartRow, {
      foreignKey: "product_id",
      as: "heightChartRows",
    });

    // A product has many linked READY_STOCK inventory items
    Product.hasMany(models.InventoryItem, {
      foreignKey: "linked_product_id",
      as: "readyStockItems",
    });
  };

  return Product;
};