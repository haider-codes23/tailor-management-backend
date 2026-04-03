"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("client_approvals", "screenshots", {
      type: Sequelize.JSONB,
      allowNull: true,
    });
    await queryInterface.addColumn("client_approvals", "cancellation_reason", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn("client_approvals", "metadata", {
      type: Sequelize.JSONB,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("client_approvals", "screenshots");
    await queryInterface.removeColumn("client_approvals", "cancellation_reason");
    await queryInterface.removeColumn("client_approvals", "metadata");
  },
};