"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("inventory_items", {
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
      category: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: "FABRIC, RAW_MATERIAL, MULTI_HEAD, ADDA_MATERIAL, READY_STOCK, READY_SAMPLE",
      },
      unit: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: "meters, pieces, kg, yards, etc.",
      },
      remaining_stock: {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: false,
        defaultValue: 0,
      },
      min_stock_level: {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: false,
        defaultValue: 0,
      },
      unit_price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0,
      },
      vendor_name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      vendor_contact: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      rack_location: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      image_url: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      linked_product_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "products", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
        comment: "Only for READY_STOCK category — links to the finished product",
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

    // Now add the FK on bom_items that we deferred
    await queryInterface.addConstraint("bom_items", {
      fields: ["inventory_item_id"],
      type: "foreign key",
      name: "bom_items_inventory_item_id_fkey",
      references: { table: "inventory_items", field: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    });

    await queryInterface.addIndex("inventory_items", ["sku"], { unique: true });
    await queryInterface.addIndex("inventory_items", ["category"]);
    await queryInterface.addIndex("inventory_items", ["linked_product_id"]);
    await queryInterface.addIndex("inventory_items", ["is_active"]);
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint("bom_items", "bom_items_inventory_item_id_fkey");
    await queryInterface.dropTable("inventory_items");
  },
};