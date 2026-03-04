"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("products", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      sku: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      images: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      product_items: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: "Main included pieces e.g. [{piece: 'shirt', price: 45000}]",
      },
      add_ons: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: "Optional add-on pieces e.g. [{piece: 'dupatta', price: 10000}]",
      },
      shopify_product_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      shopify_variant_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
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

    await queryInterface.addIndex("products", ["sku"], { unique: true });
    await queryInterface.addIndex("products", ["shopify_product_id"]);
    await queryInterface.addIndex("products", ["is_active"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("products");
  },
};