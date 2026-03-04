"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("order_items", {
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
      product_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "products", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      product_name: { type: Sequelize.STRING(255), allowNull: false },
      product_sku: { type: Sequelize.STRING(100), allowNull: true },
      product_image: { type: Sequelize.TEXT, allowNull: true },
      quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      unit_price: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      size_type: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "STANDARD",
        comment: "STANDARD or CUSTOM",
      },
      size: { type: Sequelize.STRING(50), allowNull: true },
      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "RECEIVED",
      },
      fulfillment_source: { type: Sequelize.STRING(20), allowNull: true },
      bom_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "boms", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      // Customization data
      style: { type: Sequelize.JSONB, allowNull: false, defaultValue: { type: "original", details: {}, attachments: [], image: null } },
      color: { type: Sequelize.JSONB, allowNull: false, defaultValue: { type: "original", details: "", attachments: [], image: null } },
      fabric: { type: Sequelize.JSONB, allowNull: false, defaultValue: { type: "original", details: "", attachments: [], image: null } },
      // Measurements
      measurement_categories: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      measurements: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      // Form tracking
      order_form_generated: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      order_form_approved: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      // What's included
      included_items: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: "[{piece: 'shirt', price: 45000}]",
      },
      selected_add_ons: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: "[{piece: 'dupatta', price: 10000}]",
      },
      // Section-level status tracking (denormalized for quick reads)
      section_statuses: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: "Per-section status object e.g. {shirt: {status, updatedAt}, dupatta: {...}}",
      },
      // Custom BOM data (for CUSTOM size type)
      custom_bom: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Custom BOM created by fabrication for non-standard sizes",
      },
      modesty: { type: Sequelize.BOOLEAN, allowNull: true },
      notes: { type: Sequelize.TEXT, allowNull: true },
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

    await queryInterface.addIndex("order_items", ["order_id"]);
    await queryInterface.addIndex("order_items", ["product_id"]);
    await queryInterface.addIndex("order_items", ["status"]);
    await queryInterface.addIndex("order_items", ["size_type"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("order_items");
  },
};