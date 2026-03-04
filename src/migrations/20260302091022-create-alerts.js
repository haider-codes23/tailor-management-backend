"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("alerts", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      type: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: "LOW_STOCK, OVERDUE_ORDER, FEEDBACK_DUE, MATERIAL_SHORTAGE, etc.",
      },
      severity: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "MEDIUM",
        comment: "LOW, MEDIUM, HIGH, CRITICAL",
      },
      title: { type: Sequelize.STRING(255), allowNull: false },
      message: { type: Sequelize.TEXT, allowNull: false },
      is_resolved: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      resolved_at: { type: Sequelize.DATE, allowNull: true },
      resolved_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      // Reference
      reference_type: { type: Sequelize.STRING(100), allowNull: true },
      reference_id: { type: Sequelize.UUID, allowNull: true },
      metadata: { type: Sequelize.JSONB, allowNull: true },
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

    await queryInterface.addIndex("alerts", ["type"]);
    await queryInterface.addIndex("alerts", ["severity"]);
    await queryInterface.addIndex("alerts", ["is_resolved"]);
    await queryInterface.addIndex("alerts", ["reference_type", "reference_id"]);
    await queryInterface.addIndex("alerts", ["created_at"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("alerts");
  },
};