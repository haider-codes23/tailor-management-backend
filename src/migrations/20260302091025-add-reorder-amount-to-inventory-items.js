"use strict";

/**
 * Migration: Add reorder_amount column to inventory_items
 *
 * The frontend uses reorder_amount to suggest how much to order
 * when stock falls below min_stock_level (reorder_level).
 * This was present in mockInventory.js but missing from the original migration.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("inventory_items", "reorder_amount", {
      type: Sequelize.DECIMAL(12, 4),
      allowNull: true,
      defaultValue: 0,
      comment: "Suggested quantity to reorder when stock is below min_stock_level",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("inventory_items", "reorder_amount");
  },
};