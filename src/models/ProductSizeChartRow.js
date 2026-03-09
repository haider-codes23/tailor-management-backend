/**
 * ProductSizeChartRow Model
 *
 * One row per size (XS, S, M, L, XL, XXL) per product,
 * containing body measurement values.
 *
 * Maps to `product_size_chart_rows` table created in migration 07.
 */

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProductSizeChartRow = sequelize.define(
    "ProductSizeChartRow",
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      product_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      size_code: {
        type: DataTypes.STRING(10),
        allowNull: false,
        comment: "Size label: XS, S, M, L, XL, XXL",
      },
      shoulder: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      bust: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      waist: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      hip: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      armhole: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      uk_size: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      us_size: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      sequence: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Display order: 1=XS, 2=S, 3=M, 4=L, 5=XL, 6=XXL",
      },
    },
    {
      tableName: "product_size_chart_rows",
      timestamps: true,
      underscored: true,
    }
  );

  // ─── Default template rows (matches mockMeasurementCharts.js) ───────

  ProductSizeChartRow.DEFAULT_ROWS = [
    { size_code: "XS", shoulder: 0, bust: 0, waist: 0, hip: 0, armhole: 0, uk_size: null, us_size: null, sequence: 1 },
    { size_code: "S",  shoulder: 0, bust: 0, waist: 0, hip: 0, armhole: 0, uk_size: null, us_size: null, sequence: 2 },
    { size_code: "M",  shoulder: 0, bust: 0, waist: 0, hip: 0, armhole: 0, uk_size: null, us_size: null, sequence: 3 },
    { size_code: "L",  shoulder: 0, bust: 0, waist: 0, hip: 0, armhole: 0, uk_size: null, us_size: null, sequence: 4 },
    { size_code: "XL", shoulder: 0, bust: 0, waist: 0, hip: 0, armhole: 0, uk_size: null, us_size: null, sequence: 5 },
    { size_code: "XXL",shoulder: 0, bust: 0, waist: 0, hip: 0, armhole: 0, uk_size: null, us_size: null, sequence: 6 },
  ];

  ProductSizeChartRow.DEFAULT_ENABLED_FIELDS = [
    "shoulder",
    "bust",
    "waist",
    "hip",
    "armhole",
  ];

  // ─── Associations ───────────────────────────────────────────────────

  ProductSizeChartRow.associate = (models) => {
    ProductSizeChartRow.belongsTo(models.Product, {
      foreignKey: "product_id",
      as: "product",
    });
  };

  return ProductSizeChartRow;
};