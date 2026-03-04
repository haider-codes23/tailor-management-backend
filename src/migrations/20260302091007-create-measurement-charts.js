"use strict";

/**
 * Migration 07: Create Product Measurement Charts
 *
 * CORRECTED: The original migration created a single global `measurement_charts`
 * table with chart_type (SIZE/HEIGHT) and a JSONB data blob. That matched the
 * old approach where one global chart was shared by all products.
 *
 * The frontend has since evolved so each product has its OWN size chart and
 * height chart. This corrected migration:
 *
 * 1. Adds 4 columns to the existing `products` table:
 *    - has_size_chart, has_height_chart (booleans)
 *    - enabled_size_fields, enabled_height_fields (JSONB arrays)
 *
 * 2. Creates `product_size_chart_rows` — one row per size per product
 *    (e.g. product "Elysian Verde" has its own XS/S/M/L/XL/XXL rows)
 *
 * 3. Creates `product_height_chart_rows` — one row per height range per product
 *
 * Frontend API endpoints this supports:
 *   GET    /products/:productId/measurement-charts
 *   PUT    /products/:productId/measurement-charts/size-chart
 *   PUT    /products/:productId/measurement-charts/height-chart
 *   POST   /products/:productId/measurement-charts/initialize
 *   DELETE /products/:productId/measurement-charts/size-chart
 *   DELETE /products/:productId/measurement-charts/height-chart
 */

module.exports = {
  async up(queryInterface, Sequelize) {
    // ========================================================================
    // 1. Add measurement chart config columns to the existing products table
    //    (products table was created in migration 02)
    // ========================================================================
    await queryInterface.addColumn("products", "has_size_chart", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn("products", "has_height_chart", {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });

    await queryInterface.addColumn("products", "enabled_size_fields", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: [],
      comment:
        'Which size measurement fields are active for this product, e.g. ["shoulder", "bust", "waist", "hip", "armhole"]',
    });

    await queryInterface.addColumn("products", "enabled_height_fields", {
      type: Sequelize.JSONB,
      allowNull: false,
      defaultValue: [],
      comment:
        'Which height measurement fields are active for this product, e.g. ["kaftan_length", "sleeve_front_length", "sleeve_back_length"]',
    });

    // ========================================================================
    // 2. Create product_size_chart_rows table
    //    Each product can have up to 6 rows (XS, S, M, L, XL, XXL)
    //    with measurement values specific to that product.
    // ========================================================================
    await queryInterface.createTable("product_size_chart_rows", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "products",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      size_code: {
        type: Sequelize.STRING(10),
        allowNull: false,
        comment: "Size label: XS, S, M, L, XL, XXL",
      },
      shoulder: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      bust: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      waist: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      hip: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      armhole: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      uk_size: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      us_size: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      sequence: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Display order: 1=XS, 2=S, 3=M, 4=L, 5=XL, 6=XXL",
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

    await queryInterface.addIndex("product_size_chart_rows", ["product_id"], {
      name: "idx_product_size_chart_rows_product_id",
    });

    await queryInterface.addIndex(
      "product_size_chart_rows",
      ["product_id", "size_code"],
      {
        unique: true,
        name: "idx_product_size_chart_rows_product_size_unique",
      }
    );

    // ========================================================================
    // 3. Create product_height_chart_rows table
    //    Each product can have ~5 rows (one per height range)
    //    with garment length values specific to that product.
    // ========================================================================
    await queryInterface.createTable("product_height_chart_rows", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: "products",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      height_range: {
        type: Sequelize.STRING(30),
        allowNull: false,
        comment: 'Display label, e.g. "5\'0\\" - 5\'2\\""',
      },
      height_min_inches: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: "Minimum height in total inches (60 = 5 feet)",
      },
      height_max_inches: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: "Maximum height in total inches (62 = 5 feet 2 inches)",
      },
      kaftan_length: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      sleeve_front_length: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      sleeve_back_length: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      lehnga_length: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        comment: "Used by products that include lehnga/skirt pieces",
      },
      sequence: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Display order: 1=shortest range, 5=tallest range",
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

    await queryInterface.addIndex("product_height_chart_rows", ["product_id"], {
      name: "idx_product_height_chart_rows_product_id",
    });

    await queryInterface.addIndex(
      "product_height_chart_rows",
      ["product_id", "height_range"],
      {
        unique: true,
        name: "idx_product_height_chart_rows_product_range_unique",
      }
    );
  },

  async down(queryInterface) {
    // Drop the two new tables first
    await queryInterface.dropTable("product_height_chart_rows");
    await queryInterface.dropTable("product_size_chart_rows");

    // Remove the 4 columns added to products
    await queryInterface.removeColumn("products", "enabled_height_fields");
    await queryInterface.removeColumn("products", "enabled_size_fields");
    await queryInterface.removeColumn("products", "has_height_chart");
    await queryInterface.removeColumn("products", "has_size_chart");
  },
};