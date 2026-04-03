"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // sent_to_client_at — when Sales sent the order to client
    await queryInterface.addColumn("orders", "sent_to_client_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // sent_to_client_by — which Sales user sent it
    await queryInterface.addColumn("orders", "sent_to_client_by", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });

    // client_approval_data — screenshots + approval metadata
    await queryInterface.addColumn("orders", "client_approval_data", {
      type: Sequelize.JSONB,
      allowNull: true,
      comment:
        "{approvalScreenshots: [{id, name, dataUrl, uploadedAt}], approvedAt, approvedBy, clientNotes}",
    });

    // cancellation_data — reason + who cancelled
    await queryInterface.addColumn("orders", "cancellation_data", {
      type: Sequelize.JSONB,
      allowNull: true,
      comment: "{reason, cancelledBy, cancelledByName, cancelledAt}",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("orders", "cancellation_data");
    await queryInterface.removeColumn("orders", "client_approval_data");
    await queryInterface.removeColumn("orders", "sent_to_client_by");
    await queryInterface.removeColumn("orders", "sent_to_client_at");
  },
};