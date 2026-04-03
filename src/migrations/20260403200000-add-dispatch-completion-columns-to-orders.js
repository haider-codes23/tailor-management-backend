"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // dispatch_data — stores notes, dispatchedBy, dispatchedByName, dispatchedAt
    await queryInterface.addColumn("orders", "dispatch_data", {
      type: Sequelize.JSONB,
      allowNull: true,
    });
    // completed_at — when order was marked completed
    await queryInterface.addColumn("orders", "completed_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    // completed_by — who marked it completed
    await queryInterface.addColumn("orders", "completed_by", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "users", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("orders", "dispatch_data");
    await queryInterface.removeColumn("orders", "completed_at");
    await queryInterface.removeColumn("orders", "completed_by");
  },
};