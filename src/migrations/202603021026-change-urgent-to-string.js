// src/migrations/XXXXXXXXX-change-urgent-to-string.js
"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Change from BOOLEAN to STRING to store urgent flag type (RTS, EVENT, etc.)
    await queryInterface.changeColumn("orders", "urgent", {
      type: Sequelize.STRING(20),
      allowNull: true,
      defaultValue: null,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn("orders", "urgent", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },
};