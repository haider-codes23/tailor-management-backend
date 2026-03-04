"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("customer_forms", {
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
      form_type: { type: Sequelize.STRING(20), allowNull: false, comment: "STANDARD or CUSTOM" },
      version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: "DRAFT" },
      measurements: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      custom_details: { type: Sequelize.JSONB, allowNull: true },
      generated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      approved_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      approved_at: { type: Sequelize.DATE, allowNull: true },
      rejection_reason: { type: Sequelize.TEXT, allowNull: true },
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

    await queryInterface.addIndex("customer_forms", ["order_item_id"]);
    await queryInterface.addIndex("customer_forms", ["status"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("customer_forms");
  },
};