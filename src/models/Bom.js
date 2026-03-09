/**
 * BOM (Bill of Materials) Model
 *
 * Represents a versioned bill of materials for a specific product + size.
 * Each product can have multiple BOMs per size, but only ONE active per size.
 *
 * Key concepts:
 *   - Size-based: each BOM targets a size (M, L, XL, CUSTOM, etc.) or null for default
 *   - Versioned: updating creates a new version; old one deactivated
 *   - pieces: JSONB array of piece names this BOM covers (derived from product)
 *
 * Maps to the `boms` table created in migration 03.
 */

const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Bom = sequelize.define(
    "Bom",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      product_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      size: {
        type: DataTypes.STRING(50),
        allowNull: true,
        comment: "Null = default BOM, or specific size like M, L, XL, CUSTOM",
      },
      version: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      is_active: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      pieces: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: "Array of piece names this BOM covers",
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
    },
    {
      tableName: "boms",
      timestamps: true,
      underscored: true,
    }
  );

  // ─── Class Methods ──────────────────────────────────────────────────

  /**
   * Get the next version number for a product + size combination.
   */
  Bom.getNextVersion = async function (productId, size = null) {
    const { Op } = require("sequelize");
    const where = { product_id: productId };
    if (size) {
      where.size = size;
    } else {
      where.size = { [Op.is]: null };
    }

    const maxVersion = await Bom.max("version", { where });
    return (maxVersion || 0) + 1;
  };

  /**
   * Deactivate all BOMs for a product + size (used before creating new active one).
   */
  Bom.deactivateForProductSize = async function (productId, size = null, transaction = null) {
    const { Op } = require("sequelize");
    const where = { product_id: productId, is_active: true };
    if (size) {
      where.size = size;
    } else {
      where.size = { [Op.is]: null };
    }

    await Bom.update(
      { is_active: false },
      { where, ...(transaction ? { transaction } : {}) }
    );
  };

  // ─── Associations ───────────────────────────────────────────────────

  Bom.associate = (models) => {
    Bom.belongsTo(models.Product, {
      foreignKey: "product_id",
      as: "product",
    });

    Bom.hasMany(models.BomItem, {
      foreignKey: "bom_id",
      as: "items",
    });

    Bom.belongsTo(models.User, {
      foreignKey: "created_by",
      as: "creator",
    });
  };

  return Bom;
};