"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("production_tasks", {
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
      section_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: "Shirt, Farshi, Sharara, Dupatta, Pouch, etc.",
      },
      task_type: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: "CUTTING_WORK, MACHINE_WORK, HAND_WORK, ADDA_WORK, FINISHING, CUSTOM, etc.",
      },
      custom_task_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: "Only used when task_type is CUSTOM",
      },
      sequence_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
        comment: "1-based execution order within a section",
      },
      notes: { type: Sequelize.TEXT, allowNull: true },
      // Assignment
      assigned_to_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      assigned_to_name: { type: Sequelize.STRING(255), allowNull: true },
      assigned_at: { type: Sequelize.DATE, allowNull: true },
      assigned_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      assigned_by_name: { type: Sequelize.STRING(255), allowNull: true },
      // Status
      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "PENDING",
        comment: "PENDING, READY, IN_PROGRESS, COMPLETED",
      },
      started_at: { type: Sequelize.DATE, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      duration: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: "Duration in minutes",
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

    await queryInterface.addIndex("production_tasks", ["order_item_id"]);
    await queryInterface.addIndex("production_tasks", ["assigned_to_id"]);
    await queryInterface.addIndex("production_tasks", ["status"]);
    await queryInterface.addIndex("production_tasks", ["order_item_id", "section_name"]);
    await queryInterface.addIndex("production_tasks", [
      "order_item_id",
      "section_name",
      "sequence_order",
    ]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("production_tasks");
  },
};