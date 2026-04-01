const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProductionAssignment = sequelize.define(
    "ProductionAssignment",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      order_item_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
      },
      production_head_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      production_head_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      assigned_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      assigned_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      assigned_by_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      production_started_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: "production_assignments",
      underscored: true,
      timestamps: true,
      createdAt: "created_at",
      updatedAt: "updated_at",
    }
  );

  ProductionAssignment.associate = (models) => {
    ProductionAssignment.belongsTo(models.OrderItem, {
      foreignKey: "order_item_id",
      as: "orderItem",
    });
    ProductionAssignment.belongsTo(models.User, {
      foreignKey: "production_head_id",
      as: "productionHead",
    });
    ProductionAssignment.belongsTo(models.User, {
      foreignKey: "assigned_by",
      as: "assigner",
    });
  };

  return ProductionAssignment;
};