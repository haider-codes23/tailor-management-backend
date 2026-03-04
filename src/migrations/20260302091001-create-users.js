"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("users", {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
      },
      password_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      role: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "CUSTOM",
      },
      phone: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      permissions: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      refresh_token_hash: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      last_login_at: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex("users", ["email"], { unique: true });
    await queryInterface.addIndex("users", ["role"]);
    await queryInterface.addIndex("users", ["is_active"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("users");
  },
};