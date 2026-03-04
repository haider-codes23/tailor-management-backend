"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("packets", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      order_item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "order_items", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      order_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: "orders", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "PENDING",
        comment: "PENDING, ASSIGNED, IN_PROGRESS, COMPLETED, VERIFIED, REJECTED",
      },
      // Partial packet tracking
      is_partial: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      packet_round: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      sections_included: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: "Array of section names included in this packet round",
      },
      sections_pending: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: "Sections still awaiting material",
      },
      current_round_sections: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Sections being processed in the current round (Round 2+)",
      },
      verified_sections: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: "Sections verified in previous rounds",
      },
      // Assignment info
      assigned_to: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      assigned_to_name: { type: Sequelize.STRING(255), allowNull: true },
      assigned_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      assigned_by_name: { type: Sequelize.STRING(255), allowNull: true },
      assigned_at: { type: Sequelize.DATE, allowNull: true },
      // Progress tracking
      started_at: { type: Sequelize.DATE, allowNull: true },
      completed_at: { type: Sequelize.DATE, allowNull: true },
      // Verification info
      checked_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      checked_by_name: { type: Sequelize.STRING(255), allowNull: true },
      checked_at: { type: Sequelize.DATE, allowNull: true },
      check_result: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: "APPROVED or REJECTED",
      },
      rejection_reason: { type: Sequelize.TEXT, allowNull: true },
      rejection_reason_code: { type: Sequelize.STRING(50), allowNull: true },
      rejection_notes: { type: Sequelize.TEXT, allowNull: true },
      // Counts
      total_items: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      picked_items: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      previous_round_picked_items: { type: Sequelize.INTEGER, allowNull: true },
      // Misc
      notes: { type: Sequelize.TEXT, allowNull: true },
      timeline: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      removed_pick_list_items: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: "Audit trail of removed pickList items from re-processing",
      },
      previous_assignee: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "Previous assignee info for auto-reassign in Round 2+",
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

    await queryInterface.addIndex("packets", ["order_item_id"]);
    await queryInterface.addIndex("packets", ["order_id"]);
    await queryInterface.addIndex("packets", ["status"]);
    await queryInterface.addIndex("packets", ["assigned_to"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("packets");
  },
};
