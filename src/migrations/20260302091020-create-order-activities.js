"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("order_activities", {
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
        allowNull: true,
        references: { model: "order_items", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      action: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: "Description of the action e.g. 'Order form approved', 'Inventory check passed'",
      },
      action_type: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: "STATUS_CHANGE, INVENTORY_CHECK, PACKET_EVENT, PRODUCTION, QA, DISPATCH, etc.",
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      user_name: { type: Sequelize.STRING(255), allowNull: true },
      details: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Additional structured details about the action",
      },
      section_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: "Which section this activity is about, if applicable",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
    });

    await queryInterface.addIndex("order_activities", ["order_id"]);
    await queryInterface.addIndex("order_activities", ["order_item_id"]);
    await queryInterface.addIndex("order_activities", ["action_type"]);
    await queryInterface.addIndex("order_activities", ["created_at"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("order_activities");
  },
};