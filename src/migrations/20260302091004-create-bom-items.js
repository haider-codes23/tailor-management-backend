"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("bom_items", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      bom_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "boms", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      inventory_item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: "FK added after inventory_items table exists",
      },
      piece: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: "Which section: shirt, dupatta, sharara, pouch, etc.",
      },
      quantity_per_unit: {
        type: Sequelize.DECIMAL(10, 4),
        allowNull: false,
      },
      unit: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
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

    await queryInterface.addIndex("bom_items", ["bom_id"]);
    await queryInterface.addIndex("bom_items", ["inventory_item_id"]);
    await queryInterface.addIndex("bom_items", ["piece"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("bom_items");
  },
};