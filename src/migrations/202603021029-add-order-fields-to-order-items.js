"use strict";

/**
 * Phase 8D Migration
 *
 * Adds customer form data columns to order_items table.
 * These fields store the generated order form, version history,
 * and per-garment notes directly on the order item (Option A approach).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("order_items", "order_form", {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: "Current form version: { versionId, generatedAt, generatedBy, ... }",
    });

    await queryInterface.addColumn("order_items", "order_form_versions", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: [],
      comment: "Array of all form versions for audit history",
    });

    await queryInterface.addColumn("order_items", "garment_notes", {
      type: Sequelize.JSONB,
      allowNull: true,
      defaultValue: null,
      comment: "Per-garment notes: { shirt: {...}, bottom: {...}, dupatta: {...} }",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("order_items", "garment_notes");
    await queryInterface.removeColumn("order_items", "order_form_versions");
    await queryInterface.removeColumn("order_items", "order_form");
  },
};