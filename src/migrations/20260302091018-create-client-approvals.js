"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("client_approvals", {
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
      // Approval type
      approval_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: "CLIENT_APPROVAL, ALTERATION_REQUEST, CANCELLATION, RE_VIDEO_REQUEST",
      },
      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "PENDING",
        comment: "PENDING, APPROVED, REJECTED, ALTERATION_REQUIRED, CANCELLED",
      },
      // Who did what
      submitted_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      submitted_by_name: { type: Sequelize.STRING(255), allowNull: true },
      submitted_at: { type: Sequelize.DATE, allowNull: true },
      // Client response
      client_response: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: "APPROVED, ALTERATION_REQUIRED, CANCELLED",
      },
      client_notes: { type: Sequelize.TEXT, allowNull: true },
      responded_at: { type: Sequelize.DATE, allowNull: true },
      // Alteration details
      alteration_sections: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Array of {sectionName, notes} for sections needing alteration",
      },
      alteration_notes: { type: Sequelize.TEXT, allowNull: true },
      // Account/payment verification
      payment_verified: { type: Sequelize.BOOLEAN, allowNull: true },
      payment_verified_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      payment_verified_at: { type: Sequelize.DATE, allowNull: true },
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

    await queryInterface.addIndex("client_approvals", ["order_id"]);
    await queryInterface.addIndex("client_approvals", ["order_item_id"]);
    await queryInterface.addIndex("client_approvals", ["status"]);
    await queryInterface.addIndex("client_approvals", ["approval_type"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("client_approvals");
  },
};