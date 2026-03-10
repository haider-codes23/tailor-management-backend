/**
 * OrderActivity Model
 *
 * Immutable audit log for every significant action on an order or
 * order item. Powers the Timeline tab in the Order Detail page.
 *
 * Key design decisions:
 *   - user_name is denormalized so the log remains readable even if
 *     the user is later deactivated.
 *   - details JSONB stores structured context (old_status, new_status,
 *     shortage data, etc.) without rigid schema.
 *   - section_name tracks which garment section the activity relates to.
 *   - No updated_at — activities are write-once.
 *
 * Maps to the `order_activities` table created in migration 20.
 */

const { DataTypes } = require("sequelize");
const { ACTIVITY_ACTION_TYPE } = require("../constants/order");

module.exports = (sequelize) => {
  const OrderActivity = sequelize.define(
    "OrderActivity",
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
        allowNull: true,
      },
      action: {
        type: DataTypes.STRING(255),
        allowNull: false,
        comment: "Human-readable description of what happened",
        validate: { notEmpty: { msg: "Action description is required" } },
      },
      action_type: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "STATUS_CHANGE, INVENTORY_CHECK, PACKET_EVENT, etc.",
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      user_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      details: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "Structured context: old_status, new_status, shortages, etc.",
      },
      section_name: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "Which section this activity is about, if applicable",
      },
    },
    {
      tableName: "order_activities",
      timestamps: true,
      underscored: true,
      updatedAt: false, // write-once — no updated_at column
    }
  );

  // ─── Class helper — log an activity in one call ────────────────────

  /**
   * Create an activity log entry.
   *
   * @param {Object}  opts
   * @param {string}  opts.orderId       - Required
   * @param {string}  opts.orderItemId   - Optional
   * @param {string}  opts.action        - Human-readable description
   * @param {string}  opts.actionType    - One of ACTIVITY_ACTION_TYPE
   * @param {string}  opts.userId        - Optional performer UUID
   * @param {string}  opts.userName      - Optional performer name (denormalized)
   * @param {Object}  opts.details       - Optional structured context
   * @param {string}  opts.sectionName   - Optional section piece name
   * @param {Object}  opts.transaction   - Optional Sequelize transaction
   * @returns {Promise<OrderActivity>}
   */
  OrderActivity.log = async function ({
    orderId,
    orderItemId = null,
    action,
    actionType = null,
    userId = null,
    userName = null,
    details = null,
    sectionName = null,
    transaction = null,
  }) {
    return OrderActivity.create(
      {
        order_id: orderId,
        order_item_id: orderItemId,
        action,
        action_type: actionType,
        user_id: userId,
        user_name: userName,
        details,
        section_name: sectionName,
      },
      transaction ? { transaction } : {}
    );
  };

  // ─── Associations ─────────────────────────────────────────────────

  OrderActivity.associate = (models) => {
    OrderActivity.belongsTo(models.Order, {
      foreignKey: "order_id",
      as: "order",
    });

    OrderActivity.belongsTo(models.OrderItem, {
      foreignKey: "order_item_id",
      as: "orderItem",
    });

    OrderActivity.belongsTo(models.User, {
      foreignKey: "user_id",
      as: "performer",
    });
  };

  // ─── Constants ────────────────────────────────────────────────────

  OrderActivity.ACTION_TYPE = ACTIVITY_ACTION_TYPE;

  return OrderActivity;
};