"use strict";

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const PacketItem = sequelize.define(
    "PacketItem",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      packet_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      inventory_item_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      inventory_item_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      inventory_item_sku: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      inventory_item_category: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      required_qty: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
        get() {
          const val = this.getDataValue("required_qty");
          return val === null ? null : parseFloat(val);
        },
      },
      unit: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      rack_location: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      piece: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      // Picking status
      is_picked: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      picked_qty: {
        type: DataTypes.DECIMAL(12, 4),
        allowNull: false,
        defaultValue: 0,
        get() {
          const val = this.getDataValue("picked_qty");
          return val === null ? 0 : parseFloat(val);
        },
      },
      picked_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "packet_items",
      underscored: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  PacketItem.associate = (models) => {
    PacketItem.belongsTo(models.Packet, {
      foreignKey: "packet_id",
      as: "packet",
    });
    PacketItem.belongsTo(models.InventoryItem, {
      foreignKey: "inventory_item_id",
      as: "inventoryItem",
    });
  };

  return PacketItem;
};