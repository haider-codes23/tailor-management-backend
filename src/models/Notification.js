/**
 * Notification Model — Phase 16
 *
 * In-app notifications for workflow events. Each notification targets
 * a single user and tracks read/unread state.
 *
 * Maps to the `notifications` table created in migration 20260302091021.
 */

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Notification = sequelize.define(
    "Notification",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment:
          "ORDER_CREATED, TASK_ASSIGNED, QA_REVIEW_NEEDED, CLIENT_APPROVAL_NEEDED, etc.",
      },
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      message: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      is_read: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      reference_type: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: "ORDER, ORDER_ITEM, PACKET, PRODUCTION_TASK, etc.",
      },
      reference_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      action_url: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: "Frontend route for click-through, e.g. /orders/uuid",
      },
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
        defaultValue: null,
        comment: "Extra context: order_number, section_name, etc.",
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "notifications",
      timestamps: false, // table only has created_at, no updated_at
      underscored: true,
    }
  );

  // ─── Associations ─────────────────────────────────────────────────

  Notification.associate = (models) => {
    Notification.belongsTo(models.User, {
      foreignKey: "user_id",
      as: "user",
    });
  };

  return Notification;
};