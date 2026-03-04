"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("dyeing_tasks", {
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
      order_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "orders", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      // Order item details for display (denormalized)
      product_name: { type: Sequelize.STRING(255), allowNull: true },
      product_sku: { type: Sequelize.STRING(100), allowNull: true },
      product_image: { type: Sequelize.TEXT, allowNull: true },
      customer_name: { type: Sequelize.STRING(255), allowNull: true },
      size: { type: Sequelize.STRING(50), allowNull: true },
      quantity: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 1 },
      fwd_date: { type: Sequelize.DATEONLY, allowNull: true },
      order_number: { type: Sequelize.STRING(50), allowNull: true },
      // Priority
      priority: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: "LOW, NORMAL, HIGH, URGENT",
      },
      // Sections tracked as JSONB (each section has its own status lifecycle)
      sections: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: "Array of {name, status, round, acceptedAt, acceptedBy, ...}",
      },
      // Task assignment
      assigned_to: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      assigned_to_name: { type: Sequelize.STRING(255), allowNull: true },
      assigned_at: { type: Sequelize.DATE, allowNull: true },
      // Timeline
      timeline: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
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

    await queryInterface.addIndex("dyeing_tasks", ["order_item_id"]);
    await queryInterface.addIndex("dyeing_tasks", ["order_id"]);
    await queryInterface.addIndex("dyeing_tasks", ["assigned_to"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("dyeing_tasks");
  },
};