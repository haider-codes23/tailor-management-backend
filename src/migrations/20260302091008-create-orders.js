"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("orders", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      order_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "RECEIVED",
      },
      source: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: "MANUAL",
        comment: "MANUAL or SHOPIFY",
      },
      fulfillment_source: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: "READY_STOCK or PRODUCTION — determined after creation",
      },
      // Customer info
      customer_name: { type: Sequelize.STRING(255), allowNull: false },
      customer_email: { type: Sequelize.STRING(255), allowNull: true },
      customer_phone: { type: Sequelize.STRING(50), allowNull: true },
      destination: { type: Sequelize.STRING(100), allowNull: true },
      client_height: { type: Sequelize.STRING(50), allowNull: true },
      shipping_address: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "{street1, street2, city, state, postalCode, country}",
      },
      // Shopify
      shopify_order_id: { type: Sequelize.STRING(100), allowNull: true },
      shopify_order_number: { type: Sequelize.STRING(50), allowNull: true },
      shopify_sync_status: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: "SYNCED, PENDING, FAILED, NOT_SYNCED",
      },
      shopify_last_synced_at: { type: Sequelize.DATE, allowNull: true },
      // People
      sales_owner_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      production_head_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      consultant_name: { type: Sequelize.STRING(255), allowNull: true },
      production_in_charge: { type: Sequelize.STRING(255), allowNull: true },
      // Financials
      currency: { type: Sequelize.STRING(10), allowNull: false, defaultValue: "PKR" },
      total_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      discount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      shipping_cost: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      tax: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      total_received: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      remaining_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      payment_status: { type: Sequelize.STRING(50), allowNull: false, defaultValue: "PENDING" },
      payment_method: { type: Sequelize.STRING(50), allowNull: true },
      payments: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      // Dates
      fwd_date: { type: Sequelize.DATEONLY, allowNull: true },
      production_shipping_date: { type: Sequelize.DATEONLY, allowNull: true },
      actual_shipping_date: { type: Sequelize.DATEONLY, allowNull: true },
      dispatched_at: { type: Sequelize.DATE, allowNull: true },
      // Dispatch
      dispatch_courier: { type: Sequelize.STRING(255), allowNull: true },
      dispatch_tracking: { type: Sequelize.STRING(255), allowNull: true },
      pre_tracking_id: { type: Sequelize.STRING(255), allowNull: true },
      // Feedback
      feedback_rating: { type: Sequelize.INTEGER, allowNull: true },
      feedback_text: { type: Sequelize.TEXT, allowNull: true },
      // Misc
      urgent: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      notes: { type: Sequelize.TEXT, allowNull: true },
      order_form_link: { type: Sequelize.TEXT, allowNull: true },
      tags: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      // Timestamps
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

    await queryInterface.addIndex("orders", ["order_number"], { unique: true });
    await queryInterface.addIndex("orders", ["status"]);
    await queryInterface.addIndex("orders", ["source"]);
    await queryInterface.addIndex("orders", ["fulfillment_source"]);
    await queryInterface.addIndex("orders", ["sales_owner_id"]);
    await queryInterface.addIndex("orders", ["shopify_order_id"]);
    await queryInterface.addIndex("orders", ["payment_status"]);
    await queryInterface.addIndex("orders", ["created_at"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("orders");
  },
};