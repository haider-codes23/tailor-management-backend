"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("inventory_movements", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      inventory_item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "inventory_items", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      movement_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: "STOCK_IN, STOCK_OUT, RESERVED, ADJUSTMENT, ISSUE_READY_STOCK_TO_ORDER, RETURN_READY_STOCK",
      },
      quantity: {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: false,
      },
      remaining_after: {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: false,
      },
      reference_type: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: "ORDER, ORDER_ITEM, PURCHASE, ADJUSTMENT, PACKET",
      },
      reference_id: {
        type: Sequelize.UUID,
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      performed_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      transaction_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("inventory_movements", ["inventory_item_id"]);
    await queryInterface.addIndex("inventory_movements", ["movement_type"]);
    await queryInterface.addIndex("inventory_movements", ["reference_type", "reference_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("inventory_movements");
  },
};