const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProductionTask = sequelize.define(
    "ProductionTask",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      order_item_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      section_name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      task_type: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      custom_task_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      sequence_order: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // Assignment
      assigned_to_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      assigned_to_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      assigned_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      assigned_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      assigned_by_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      // Status
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "PENDING",
      },
      started_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      duration: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: "Duration in minutes",
      },
    },
    {
      tableName: "production_tasks",
      underscored: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  ProductionTask.associate = (models) => {
    ProductionTask.belongsTo(models.OrderItem, {
      foreignKey: "order_item_id",
      as: "orderItem",
    });
    ProductionTask.belongsTo(models.User, {
      foreignKey: "assigned_to_id",
      as: "assignee",
    });
    ProductionTask.belongsTo(models.User, {
      foreignKey: "assigned_by",
      as: "assigner",
    });
  };

  return ProductionTask;
};