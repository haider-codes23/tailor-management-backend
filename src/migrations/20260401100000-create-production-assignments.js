"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("production_assignments", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      order_item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: "order_items", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
        comment: "One production head per order item",
      },
      production_head_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      production_head_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      assigned_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      assigned_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      assigned_by_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      production_started_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: "Set when first section starts production",
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

    await queryInterface.addIndex("production_assignments", ["order_item_id"]);
    await queryInterface.addIndex("production_assignments", ["production_head_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("production_assignments");
  },
};