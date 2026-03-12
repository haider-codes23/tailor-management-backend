"use strict";

/**
 * Migration: Add height_range column to order_items table.
 *
 * The OrderItem model defines height_range but the original migration
 * (20260302091009-create-order-items.js) omitted it. This column stores
 * the customer's height range selection (e.g. "5ft0in-5ft2in").
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("order_items", "height_range", {
      type: Sequelize.STRING(50),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("order_items", "height_range");
  },
};