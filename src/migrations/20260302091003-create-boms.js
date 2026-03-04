"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("boms", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "products", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      size: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: "Null = default BOM, or specific size like M, L, XL",
      },
      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      pieces: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: "Array of piece names this BOM covers",
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
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

    await queryInterface.addIndex("boms", ["product_id", "size", "is_active"]);
    await queryInterface.addIndex("boms", ["product_id"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("boms");
  },
};