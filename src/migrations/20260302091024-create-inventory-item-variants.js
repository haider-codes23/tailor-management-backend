"use strict";

/**
 * Migration: inventory_item_variants
 *
 * Supports READY_STOCK and READY_SAMPLE items that have per-size stock tracking.
 * Each variant represents a specific size (S, M, L, XL, etc.) with its own
 * stock level, reorder threshold, pricing, and SKU.
 *
 * The parent inventory_item row stores shared fields (name, category, vendor, etc.)
 * while this table stores size-specific data.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("inventory_item_variants", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      inventory_item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "inventory_items", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      size: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: "Size label: XS, S, M, L, XL, XXL, or custom",
      },
      sku: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: "Size-specific SKU e.g. RS-GOLD-043-M",
      },
      remaining_stock: {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: false,
        defaultValue: 0,
      },
      reorder_level: {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: false,
        defaultValue: 0,
      },
      reorder_amount: {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: true,
        defaultValue: 0,
        comment: "Suggested reorder quantity when stock is low",
      },
      price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true,
        comment: "Size-specific price override (falls back to parent unit_price if null)",
      },
      image_url: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "Size-specific image override",
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

    // Indexes
    await queryInterface.addIndex("inventory_item_variants", ["inventory_item_id"]);
    await queryInterface.addIndex("inventory_item_variants", ["size"]);
    await queryInterface.addIndex(
      "inventory_item_variants",
      ["inventory_item_id", "size"],
      { unique: true, name: "unique_item_size" }
    );
    await queryInterface.addIndex("inventory_item_variants", ["sku"], {
      unique: true,
      where: { sku: { [Sequelize.Op.ne]: null } },
      name: "unique_variant_sku",
    });

    // Also add a has_variants boolean column to inventory_items
    await queryInterface.addColumn("inventory_items", "has_variants", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: "True for READY_STOCK/READY_SAMPLE that track per-size stock",
    });

    // Add description and notes columns to inventory_items (used by frontend but missing from migration)
    await queryInterface.addColumn("inventory_items", "description", {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn("inventory_items", "notes", {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    // Add variant_id column to inventory_movements for tracking which variant was affected
    await queryInterface.addColumn("inventory_movements", "variant_id", {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: "inventory_item_variants", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
      comment: "For variant items — which size variant was affected",
    });

    await queryInterface.addIndex("inventory_movements", ["variant_id"]);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("inventory_movements", "variant_id");
    await queryInterface.removeColumn("inventory_items", "has_variants");
    await queryInterface.removeColumn("inventory_items", "description");
    await queryInterface.removeColumn("inventory_items", "notes");
    await queryInterface.dropTable("inventory_item_variants");
  },
};