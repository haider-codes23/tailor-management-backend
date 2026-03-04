"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("procurement_demands", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      order_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "orders", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      order_item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "order_items", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      inventory_item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "inventory_items", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      inventory_item_name: { type: Sequelize.STRING(255), allowNull: true },
      inventory_item_sku: { type: Sequelize.STRING(100), allowNull: true },
      required_qty: { type: Sequelize.DECIMAL(12, 4), allowNull: false },
      available_qty: { type: Sequelize.DECIMAL(12, 4), allowNull: false, defaultValue: 0 },
      shortage_qty: { type: Sequelize.DECIMAL(12, 4), allowNull: false },
      unit: { type: Sequelize.STRING(50), allowNull: true },
      affected_section: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: "Which section this shortage affects e.g. Dupatta, Pouch",
      },
      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "OPEN",
        comment: "OPEN, ORDERED, RECEIVED, CANCELLED",
      },
      notes: { type: Sequelize.TEXT, allowNull: true },
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

    await queryInterface.addIndex("procurement_demands", ["order_id"]);
    await queryInterface.addIndex("procurement_demands", ["order_item_id"]);
    await queryInterface.addIndex("procurement_demands", ["inventory_item_id"]);
    await queryInterface.addIndex("procurement_demands", ["status"]);
    await queryInterface.addIndex("procurement_demands", ["affected_section"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("procurement_demands");
  },
};