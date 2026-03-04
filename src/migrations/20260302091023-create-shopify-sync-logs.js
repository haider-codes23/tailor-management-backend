"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("shopify_sync_logs", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      order_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "orders", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      shopify_order_id: { type: Sequelize.STRING(100), allowNull: true },
      sync_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: "IMPORT, EXPORT, WEBHOOK, FULFILLMENT_UPDATE, RESYNC",
      },
      sync_direction: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: "SHOPIFY_TO_LOCAL or LOCAL_TO_SHOPIFY",
      },
      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "PENDING",
        comment: "PENDING, IN_PROGRESS, SUCCESS, FAILED",
      },
      request_payload: { type: Sequelize.JSONB, allowNull: true },
      response_payload: { type: Sequelize.JSONB, allowNull: true },
      error_message: { type: Sequelize.TEXT, allowNull: true },
      error_details: { type: Sequelize.JSONB, allowNull: true },
      retry_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      initiated_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      completed_at: { type: Sequelize.DATE, allowNull: true },
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

    await queryInterface.addIndex("shopify_sync_logs", ["order_id"]);
    await queryInterface.addIndex("shopify_sync_logs", ["shopify_order_id"]);
    await queryInterface.addIndex("shopify_sync_logs", ["sync_type"]);
    await queryInterface.addIndex("shopify_sync_logs", ["status"]);
    await queryInterface.addIndex("shopify_sync_logs", ["created_at"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("shopify_sync_logs");
  },
};