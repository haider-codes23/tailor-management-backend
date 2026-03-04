"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("packet_items", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      packet_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "packets", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      inventory_item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "inventory_items", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      inventory_item_name: { type: Sequelize.STRING(255), allowNull: true },
      inventory_item_sku: { type: Sequelize.STRING(100), allowNull: true },
      inventory_item_category: { type: Sequelize.STRING(50), allowNull: true },
      required_qty: {
        type: Sequelize.DECIMAL(12, 4),
        allowNull: false,
      },
      unit: { type: Sequelize.STRING(50), allowNull: true },
      rack_location: { type: Sequelize.STRING(100), allowNull: true },
      piece: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: "Which section: shirt, dupatta, sharara, pouch, etc.",
      },
      // Picking status
      is_picked: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      picked_qty: { type: Sequelize.DECIMAL(12, 4), allowNull: false, defaultValue: 0 },
      picked_at: { type: Sequelize.DATE, allowNull: true },
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

    await queryInterface.addIndex("packet_items", ["packet_id"]);
    await queryInterface.addIndex("packet_items", ["inventory_item_id"]);
    await queryInterface.addIndex("packet_items", ["piece"]);
    await queryInterface.addIndex("packet_items", ["is_picked"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("packet_items");
  },
};