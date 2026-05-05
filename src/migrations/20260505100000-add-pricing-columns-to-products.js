"use strict";

/**
 * Migration: Add pricing columns to products table
 *
 * The Product model defines subtotal, discount, and total_price columns
 * (computed from product_items + add_ons JSONB), but the original
 * migration 02 (create-products) did not include them.
 * This migration adds the missing columns to the production DB.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("products", "subtotal", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn("products", "discount", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.addColumn("products", "total_price", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("products", "total_price");
    await queryInterface.removeColumn("products", "discount");
    await queryInterface.removeColumn("products", "subtotal");
  },
};