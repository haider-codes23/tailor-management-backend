"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("order_item_sections", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      order_item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "order_items", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      piece: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: "shirt, dupatta, sharara, pouch, etc.",
      },
      type: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "MAIN",
        comment: "MAIN or ADD_ON",
      },
      price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "PENDING_INVENTORY_CHECK",
      },
      status_updated_at: { type: Sequelize.DATE, allowNull: true },
      status_updated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
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

    await queryInterface.addIndex("order_item_sections", ["order_item_id"]);
    await queryInterface.addIndex("order_item_sections", ["status"]);
    await queryInterface.addIndex("order_item_sections", ["piece"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("order_item_sections");
  },
};