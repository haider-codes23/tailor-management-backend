/**
 * ClientApproval Model
 *
 * Tracks client approval events — approvals, alteration requests,
 * cancellations, re-video requests, and payment verifications.
 * Each action creates a new row for audit history.
 *
 * Maps to the `client_approvals` table created in migration 18.
 */

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ClientApproval = sequelize.define(
    "ClientApproval",
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
      approval_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        comment:
          "CLIENT_APPROVAL, ALTERATION_REQUEST, CANCELLATION, RE_VIDEO_REQUEST, PAYMENT_VERIFICATION, SENT_TO_CLIENT, START_FROM_SCRATCH",
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "PENDING",
      },
      // Who did what
      submitted_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      submitted_by_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      submitted_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      // Client response
      client_response: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      client_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      responded_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      // Alteration details
      alteration_sections: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      alteration_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // Payment verification
      payment_verified: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
        defaultValue: false,
      },
      payment_verified_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      payment_verified_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      // Screenshots
      screenshots: {
        type: DataTypes.JSONB,
        allowNull: true,
        comment: "[{id, name, dataUrl, uploadedAt, uploadedBy}]",
      },
      // Cancellation
      cancellation_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // Metadata
      metadata: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      tableName: "client_approvals",
      timestamps: true,
      underscored: true,
    }
  );

  ClientApproval.associate = (models) => {
    ClientApproval.belongsTo(models.Order, {
      foreignKey: "order_id",
      as: "order",
    });
    ClientApproval.belongsTo(models.OrderItem, {
      foreignKey: "order_item_id",
      as: "orderItem",
    });
    ClientApproval.belongsTo(models.User, {
      foreignKey: "submitted_by",
      as: "submitter",
    });
  };

  return ClientApproval;
};