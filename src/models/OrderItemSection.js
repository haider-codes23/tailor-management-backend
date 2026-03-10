/**
 * OrderItemSection Model
 *
 * Represents a single garment section (e.g. "shirt", "dupatta", "sharara")
 * within an order item. Each section tracks its own status independently
 * through the production workflow.
 *
 * Sections are created from:
 *   - included_items on the order item (type = MAIN)
 *   - selected_add_ons on the order item (type = ADD_ON)
 *
 * Maps to the `order_item_sections` table created in migration 10.
 */

const { DataTypes } = require("sequelize");
const {
  SECTION_STATUS,
  SECTION_STATUS_VALUES,
  SECTION_TYPE,
} = require("../constants/order");

module.exports = (sequelize) => {
  const OrderItemSection = sequelize.define(
    "OrderItemSection",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      order_item_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      piece: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "shirt, dupatta, sharara, pouch, etc.",
        validate: { notEmpty: { msg: "Piece name is required" } },
      },
      type: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: SECTION_TYPE.MAIN,
        comment: "MAIN or ADD_ON",
      },
      price: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
        get() {
          const v = this.getDataValue("price");
          return v !== null ? parseFloat(v) : 0;
        },
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: SECTION_STATUS.PENDING_INVENTORY_CHECK,
      },
      status_updated_at: { type: DataTypes.DATE, allowNull: true },
      status_updated_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: "order_item_sections",
      timestamps: true,
      underscored: true,
    }
  );

  // ─── Associations ─────────────────────────────────────────────────

  OrderItemSection.associate = (models) => {
    OrderItemSection.belongsTo(models.OrderItem, {
      foreignKey: "order_item_id",
      as: "orderItem",
    });

    OrderItemSection.belongsTo(models.User, {
      foreignKey: "status_updated_by",
      as: "statusUpdater",
    });
  };

  // ─── Constants ────────────────────────────────────────────────────

  OrderItemSection.STATUS = SECTION_STATUS;
  OrderItemSection.TYPE = SECTION_TYPE;

  return OrderItemSection;
};