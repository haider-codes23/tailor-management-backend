/**
 * ProductHeightChartRow Model
 *
 * One row per height range per product, containing garment length values.
 *
 * Maps to `product_height_chart_rows` table created in migration 07.
 */

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ProductHeightChartRow = sequelize.define(
    "ProductHeightChartRow",
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
      height_range: {
        type: DataTypes.STRING(30),
        allowNull: false,
        comment: 'Display label, e.g. "5\'0\\" - 5\'2\\""',
      },
      height_min_inches: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Minimum height in total inches (60 = 5 feet)",
      },
      height_max_inches: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: "Maximum height in total inches (62 = 5 feet 2 inches)",
      },
      kaftan_length: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      sleeve_front_length: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      sleeve_back_length: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      lehnga_length: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        comment: "Used by products that include lehnga/skirt pieces",
      },
      sequence: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: "Display order: 1=shortest range, 5=tallest range",
      },
    },
    {
      tableName: "product_height_chart_rows",
      timestamps: true,
      underscored: true,
    }
  );

  // ─── Default template rows (matches mockMeasurementCharts.js) ───────

  ProductHeightChartRow.DEFAULT_ROWS = [
    { height_range: '5\'0" - 5\'2"',  height_min_inches: 60, height_max_inches: 62, kaftan_length: 0, sleeve_front_length: 0, sleeve_back_length: 0, lehnga_length: 0, sequence: 1 },
    { height_range: '5\'2" - 5\'4"',  height_min_inches: 62, height_max_inches: 64, kaftan_length: 0, sleeve_front_length: 0, sleeve_back_length: 0, lehnga_length: 0, sequence: 2 },
    { height_range: '5\'4" - 5\'6"',  height_min_inches: 64, height_max_inches: 66, kaftan_length: 0, sleeve_front_length: 0, sleeve_back_length: 0, lehnga_length: 0, sequence: 3 },
    { height_range: '5\'6" - 5\'8"',  height_min_inches: 66, height_max_inches: 68, kaftan_length: 0, sleeve_front_length: 0, sleeve_back_length: 0, lehnga_length: 0, sequence: 4 },
    { height_range: '5\'8" - 6\'0"',  height_min_inches: 68, height_max_inches: 72, kaftan_length: 0, sleeve_front_length: 0, sleeve_back_length: 0, lehnga_length: 0, sequence: 5 },
  ];

  ProductHeightChartRow.DEFAULT_ENABLED_FIELDS = [
    "kaftan_length",
    "sleeve_front_length",
    "sleeve_back_length",
    "lehnga_length",
  ];

  // ─── Associations ───────────────────────────────────────────────────

  ProductHeightChartRow.associate = (models) => {
    ProductHeightChartRow.belongsTo(models.Product, {
      foreignKey: "product_id",
      as: "product",
    });
  };

  return ProductHeightChartRow;
};