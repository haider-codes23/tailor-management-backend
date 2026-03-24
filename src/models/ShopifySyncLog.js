/**
 * ShopifySyncLog Model
 *
 * Audit log for every Shopify ↔ Local sync event.
 * Records imports, exports, webhook receipts, and fulfillment updates.
 *
 * Maps to the `shopify_sync_logs` table created in migration 18.
 */

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ShopifySyncLog = sequelize.define(
    "ShopifySyncLog",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      order_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      shopify_order_id: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      sync_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment: "IMPORT, EXPORT, WEBHOOK, FULFILLMENT_UPDATE, RESYNC",
      },
      sync_direction: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: "SHOPIFY_TO_LOCAL or LOCAL_TO_SHOPIFY",
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "PENDING",
        comment: "PENDING, IN_PROGRESS, SUCCESS, FAILED",
      },
      request_payload: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      response_payload: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      error_details: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      retry_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      initiated_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "shopify_sync_logs",
      timestamps: true,
      underscored: true,
    }
  );

  // ─── Associations ─────────────────────────────────────────────────

  ShopifySyncLog.associate = (models) => {
    ShopifySyncLog.belongsTo(models.Order, {
      foreignKey: "order_id",
      as: "order",
    });

    ShopifySyncLog.belongsTo(models.User, {
      foreignKey: "initiated_by",
      as: "initiator",
    });
  };

  return ShopifySyncLog;
};