/**
 * BOM Item Model
 *
 * A single line item within a BOM, linking an inventory item to a specific
 * section (piece) of the product with a required quantity.
 *
 * Key fields:
 *   - bom_id: which BOM this belongs to
 *   - inventory_item_id: which raw material / fabric / etc.
 *   - piece: which garment section (shirt, dupatta, sharara, pouch, etc.)
 *   - quantity_per_unit: how much of this material per 1 unit of product
 *
 * Maps to the `bom_items` table created in migration 04.
 */

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const BomItem = sequelize.define(
    "BomItem",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      bom_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      inventory_item_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      piece: {
        type: DataTypes.STRING(100),
        allowNull: false,
        comment: "Which section: shirt, dupatta, sharara, pouch, etc.",
      },
      quantity_per_unit: {
        type: DataTypes.DECIMAL(10, 4),
        allowNull: false,
        validate: {
          min: { args: [0.0001], msg: "Quantity must be greater than 0" },
        },
      },
      unit: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "If null, derived from the inventory item's unit",
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: "bom_items",
      timestamps: true,
      underscored: true,
    }
  );

  // ─── Allowed inventory categories for BOM items ─────────────────────
  BomItem.ALLOWED_CATEGORIES = [
    "FABRIC",
    "RAW_MATERIAL",
    "MULTI_HEAD",
    "ADDA_MATERIAL",
  ];

  // ─── Associations ───────────────────────────────────────────────────

  BomItem.associate = (models) => {
    BomItem.belongsTo(models.Bom, {
      foreignKey: "bom_id",
      as: "bom",
    });

    BomItem.belongsTo(models.InventoryItem, {
      foreignKey: "inventory_item_id",
      as: "inventoryItem",
    });
  };

  return BomItem;
};