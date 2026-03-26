"use strict";

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Packet = sequelize.define(
    "Packet",
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
      order_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "PENDING",
      },
      // Partial packet tracking
      is_partial: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      packet_round: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      sections_included: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      sections_pending: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      current_round_sections: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
      verified_sections: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      // Assignment info
      assigned_to: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      assigned_to_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      assigned_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      assigned_by_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      assigned_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      // Progress tracking
      started_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      // Verification info
      checked_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      checked_by_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      checked_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      check_result: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      rejection_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      rejection_reason_code: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      rejection_notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // Counts
      total_items: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      picked_items: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      previous_round_picked_items: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      // Misc
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      timeline: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      removed_pick_list_items: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      previous_assignee: {
        type: DataTypes.JSONB,
        allowNull: true,
      },
    },
    {
      tableName: "packets",
      underscored: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  Packet.associate = (models) => {
    Packet.belongsTo(models.OrderItem, {
      foreignKey: "order_item_id",
      as: "orderItem",
    });
    Packet.belongsTo(models.Order, {
      foreignKey: "order_id",
      as: "order",
    });
    Packet.belongsTo(models.User, {
      foreignKey: "assigned_to",
      as: "assignee",
    });
    Packet.belongsTo(models.User, {
      foreignKey: "checked_by",
      as: "checker",
    });
    Packet.hasMany(models.PacketItem, {
      foreignKey: "packet_id",
      as: "items",
    });
  };

  return Packet;
};