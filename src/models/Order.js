/**
 * Order Model
 *
 * The top-level order entity. Each order has many OrderItems,
 * each of which has many OrderItemSections.
 *
 * Key features:
 *   - Dual creation paths: MANUAL (Sales) or SHOPIFY (webhook / import)
 *   - Dual fulfillment: READY_STOCK (skip production) or PRODUCTION (full workflow)
 *   - Shopify sync fields for bi-directional integration
 *   - JSONB payments array for flexible payment tracking
 *   - Auto-generated order_number (ORD-YYYY-NNNN)
 *
 * Maps to the `orders` table created in migration 08.
 */

const { DataTypes } = require("sequelize");
const {
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  ORDER_SOURCE_VALUES,
  FULFILLMENT_SOURCE_VALUES,
  PAYMENT_STATUS,
  PAYMENT_STATUS_VALUES,
} = require("../constants/order");

module.exports = (sequelize) => {
  const Order = sequelize.define(
    "Order",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      order_number: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: ORDER_STATUS.RECEIVED,
        validate: {
          isIn: {
            args: [ORDER_STATUS_VALUES],
            msg: `Status must be one of: ${ORDER_STATUS_VALUES.join(", ")}`,
          },
        },
      },
      source: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: "MANUAL",
        validate: {
          isIn: {
            args: [ORDER_SOURCE_VALUES],
            msg: `Source must be one of: ${ORDER_SOURCE_VALUES.join(", ")}`,
          },
        },
      },
      fulfillment_source: {
        type: DataTypes.STRING(20),
        allowNull: true,
        validate: {
          isIn: {
            args: [[...FULFILLMENT_SOURCE_VALUES, null]],
            msg: `Fulfillment source must be one of: ${FULFILLMENT_SOURCE_VALUES.join(", ")}`,
          },
        },
      },

      // ── Customer info ───────────────────────────────────────────────
      customer_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: { notEmpty: { msg: "Customer name is required" } },
      },
      customer_email: { type: DataTypes.STRING(255), allowNull: true },
      customer_phone: { type: DataTypes.STRING(50), allowNull: true },
      destination: { type: DataTypes.STRING(100), allowNull: true },
      client_height: { type: DataTypes.STRING(50), allowNull: true },
      shipping_address: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "{street1, street2, city, state, postalCode, country}",
      },

      // ── Shopify ─────────────────────────────────────────────────────
      shopify_order_id: { type: DataTypes.STRING(100), allowNull: true },
      shopify_order_number: { type: DataTypes.STRING(50), allowNull: true },
      shopify_sync_status: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      shopify_last_synced_at: { type: DataTypes.DATE, allowNull: true },

      // ── People ──────────────────────────────────────────────────────
      sales_owner_id: { type: DataTypes.UUID, allowNull: true },
      production_head_id: { type: DataTypes.UUID, allowNull: true },
      consultant_name: { type: DataTypes.STRING(255), allowNull: true },
      production_in_charge: { type: DataTypes.STRING(255), allowNull: true },

      // ── Financials ──────────────────────────────────────────────────
      currency: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: "PKR",
      },
      total_amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        get() {
          const v = this.getDataValue("total_amount");
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
      shipping_cost: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        get() {
          const v = this.getDataValue("shipping_cost");
          return v !== null ? parseFloat(v) : 0;
        },
      },
      tax: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        get() {
          const v = this.getDataValue("tax");
          return v !== null ? parseFloat(v) : 0;
        },
      },
      total_received: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        get() {
          const v = this.getDataValue("total_received");
          return v !== null ? parseFloat(v) : 0;
        },
      },
      remaining_amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        get() {
          const v = this.getDataValue("remaining_amount");
          return v !== null ? parseFloat(v) : 0;
        },
      },
      payment_status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: PAYMENT_STATUS.PENDING,
        validate: {
          isIn: {
            args: [PAYMENT_STATUS_VALUES],
            msg: `Payment status must be one of: ${PAYMENT_STATUS_VALUES.join(", ")}`,
          },
        },
      },
      payment_method: { type: DataTypes.STRING(50), allowNull: true },
      payments: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },

      // ── Dates ───────────────────────────────────────────────────────
      fwd_date: { type: DataTypes.DATEONLY, allowNull: true },
      production_shipping_date: { type: DataTypes.DATEONLY, allowNull: true },
      actual_shipping_date: { type: DataTypes.DATEONLY, allowNull: true },
      dispatched_at: { type: DataTypes.DATE, allowNull: true },

      // ── Dispatch ────────────────────────────────────────────────────
      dispatch_courier: { type: DataTypes.STRING(255), allowNull: true },
      dispatch_tracking: { type: DataTypes.STRING(255), allowNull: true },
      pre_tracking_id: { type: DataTypes.STRING(255), allowNull: true },

      // ── Feedback ────────────────────────────────────────────────────
      feedback_rating: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: { min: 1, max: 5 },
      },
      feedback_text: { type: DataTypes.TEXT, allowNull: true },

      // ── Misc ────────────────────────────────────────────────────────
      urgent: {
        type: DataTypes.STRING(20),
        allowNull: true,
        defaultValue: null,
      },
      notes: { type: DataTypes.TEXT, allowNull: true },
      order_form_link: { type: DataTypes.TEXT, allowNull: true },
      tags: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
    },
    {
      tableName: "orders",
      timestamps: true,
      underscored: true,
    }
  );

  // ─── Class Methods ────────────────────────────────────────────────

  /**
   * Generate the next sequential order number: ORD-YYYY-NNNN
   */
  Order.generateOrderNumber = async function (transaction = null) {
    const year = new Date().getFullYear();
    const prefix = `ORD-${year}-`;

    const latest = await Order.findOne({
      where: { order_number: { [require("sequelize").Op.like]: `${prefix}%` } },
      order: [["order_number", "DESC"]],
      attributes: ["order_number"],
      ...(transaction ? { transaction } : {}),
    });

    let nextSeq = 1;
    if (latest) {
      const lastSeq = parseInt(latest.order_number.replace(prefix, ""), 10);
      if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
    }

    return `${prefix}${String(nextSeq).padStart(4, "0")}`;
  };

  // ─── Instance Methods ─────────────────────────────────────────────

  /**
   * Compute days delayed (actual vs planned shipping date).
   */
  Order.prototype.getDelayedDays = function () {
    if (!this.production_shipping_date || !this.actual_shipping_date) return null;
    const planned = new Date(this.production_shipping_date);
    const actual = new Date(this.actual_shipping_date);
    return Math.ceil((actual - planned) / (1000 * 60 * 60 * 24));
  };

  Order.prototype.toJSON = function () {
    const values = { ...this.get() };
    values.delayed_days = this.getDelayedDays();
    return values;
  };

  // ─── Associations ─────────────────────────────────────────────────

  Order.associate = (models) => {
    Order.hasMany(models.OrderItem, {
      foreignKey: "order_id",
      as: "items",
    });

    Order.hasMany(models.OrderActivity, {
      foreignKey: "order_id",
      as: "activities",
    });

    Order.belongsTo(models.User, {
      foreignKey: "sales_owner_id",
      as: "salesOwner",
    });

    Order.belongsTo(models.User, {
      foreignKey: "production_head_id",
      as: "productionHead",
    });
  };

  // ─── Attach constants to model for convenience ────────────────────

  Order.STATUS = ORDER_STATUS;
  Order.PAYMENT_STATUS = PAYMENT_STATUS;

  return Order;
};