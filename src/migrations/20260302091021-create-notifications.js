"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("notifications", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      type: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: "ORDER_STATUS, PACKET_ASSIGNED, QA_REQUIRED, DYEING_READY, PRODUCTION_TASK, etc.",
      },
      title: { type: Sequelize.STRING(255), allowNull: false },
      message: { type: Sequelize.TEXT, allowNull: false },
      is_read: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      // Reference to related entity
      reference_type: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: "ORDER, ORDER_ITEM, PACKET, PRODUCTION_TASK, DYEING_TASK, etc.",
      },
      reference_id: { type: Sequelize.UUID, allowNull: true },
      // Link for navigation
      action_url: { type: Sequelize.TEXT, allowNull: true },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Additional data like order number, section name, etc.",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("notifications", ["user_id"]);
    await queryInterface.addIndex("notifications", ["user_id", "is_read"]);
    await queryInterface.addIndex("notifications", ["type"]);
    await queryInterface.addIndex("notifications", ["created_at"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("notifications");
  },
};

