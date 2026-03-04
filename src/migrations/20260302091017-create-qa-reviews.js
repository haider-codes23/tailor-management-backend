"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("qa_reviews", {
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
      section_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      round: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "PENDING",
        comment: "PENDING, APPROVED, REJECTED",
      },
      // Review details
      reviewed_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      reviewed_by_name: { type: Sequelize.STRING(255), allowNull: true },
      reviewed_at: { type: Sequelize.DATE, allowNull: true },
      // Rejection details
      rejection_reason_code: { type: Sequelize.STRING(50), allowNull: true },
      rejection_reason: { type: Sequelize.TEXT, allowNull: true },
      rejection_notes: { type: Sequelize.TEXT, allowNull: true },
      // Video data (uploaded after all sections approved)
      video_url: { type: Sequelize.TEXT, allowNull: true },
      video_uploaded_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      video_uploaded_at: { type: Sequelize.DATE, allowNull: true },
      video_file_name: { type: Sequelize.STRING(255), allowNull: true },
      video_file_size: { type: Sequelize.BIGINT, allowNull: true },
      video_duration: { type: Sequelize.STRING(50), allowNull: true },
      // Re-video request
      re_video_request: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: "{requestedBy, requestedByName, requestedAt, sections, notes}",
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

    await queryInterface.addIndex("qa_reviews", ["order_item_id"]);
    await queryInterface.addIndex("qa_reviews", ["status"]);
    await queryInterface.addIndex("qa_reviews", ["order_item_id", "section_name", "round"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("qa_reviews");
  },
};