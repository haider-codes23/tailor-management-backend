/**
 * Inventory Service
 *
 * Business logic for inventory management — separated from HTTP concerns.
 * Mirrors the logic from the frontend MSW inventoryHandlers.js.
 *
 * Handles:
 * - List items with filters (category, search, low_stock)
 * - Get item detail (with variants and computed fields)
 * - Create / update / soft-delete items
 * - Stock-in / stock-out with audit trail (inventory_movements)
 * - Low stock detection
 * - Stock movement history
 */

const { Op, literal } = require("sequelize");
const {
  sequelize,
  InventoryItem,
  InventoryItemVariant,
  InventoryMovement,
} = require("../models");

// =========================================================================
// Helpers
// =========================================================================

/**
 * Standard include for loading variants on an InventoryItem query.
 */
const variantsInclude = {
  model: InventoryItemVariant,
  as: "variants",
  required: false,
  where: { is_active: true },
  order: [["size", "ASC"]],
};

/**
 * Create a service-layer error with status code.
 */
function serviceError(message, status = 400, code = "INVENTORY_ERROR") {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

// =========================================================================
// List Inventory Items
// =========================================================================

/**
 * List inventory items with optional filters.
 *
 * @param {Object} filters
 * @param {string}  filters.category  - Filter by category (or "all")
 * @param {string}  filters.search    - Search name/SKU
 * @param {string}  filters.low_stock - "true" to show only low-stock items
 * @returns {Promise<Object>} { items, total, filters_applied }
 */
async function listItems({ category, search, low_stock } = {}) {
  const where = { is_active: true };

  // Category filter
  if (category && category.toLowerCase() !== "all") {
    where.category = category;
  }

  // Search filter (name or SKU, case-insensitive)
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { sku: { [Op.iLike]: term } },
    ];
  }

  let items = await InventoryItem.findAll({
    where,
    include: [variantsInclude],
    order: [["name", "ASC"]],
  });

  // Low stock filter (applied post-query because it depends on computed values)
  if (low_stock === "true" || low_stock === true) {
    items = items.filter((item) => {
      const json = item.toJSON();
      return json.is_low_stock;
    });
  }

  return {
    items: items.map((i) => i.toJSON()),
    total: items.length,
    filters_applied: {
      category: category || null,
      search: search || null,
      low_stock: low_stock === "true" || low_stock === true,
    },
  };
}

// =========================================================================
// Get Item Detail
// =========================================================================

/**
 * Get a single inventory item by ID with variants.
 *
 * @param {string} itemId - UUID
 * @returns {Promise<Object>} Item JSON
 */
async function getItemById(itemId) {
  const item = await InventoryItem.findByPk(itemId, {
    include: [variantsInclude],
  });

  if (!item) {
    throw serviceError("Inventory item not found", 404, "ITEM_NOT_FOUND");
  }

  return item.toJSON();
}

// =========================================================================
// Create Item
// =========================================================================

/**
 * Create a new inventory item.
 *
 * For simple items: pass remaining_stock, min_stock_level directly.
 * For variant items: pass has_variants=true and variants[] array.
 *
 * @param {Object} data - Item fields + optional variants
 * @returns {Promise<Object>} Created item JSON
 */
async function createItem(data) {
  const {
    name, sku, category, description, unit,
    remaining_stock, min_stock_level, unit_price,
    vendor_name, vendor_contact, rack_location,
    image_url, linked_product_id, has_variants,
    notes, variants,
    // Frontend compatibility aliases
    reorder_level, reorder_amount, base_price,
  } = data;

  // Check SKU uniqueness
  const existing = await InventoryItem.findOne({ where: { sku } });
  if (existing) {
    throw serviceError(`An item with SKU ${sku} already exists`, 400, "DUPLICATE_SKU");
  }

  // Validate: READY_STOCK must have linked_product_id (optional enforcement)
  // Validate: variant items must have variants array
  if (has_variants && (!variants || !variants.length)) {
    throw serviceError(
      "Variant items (READY_STOCK/READY_SAMPLE) must include a variants array",
      400,
      "VARIANTS_REQUIRED"
    );
  }

  const result = await sequelize.transaction(async (t) => {
    // Create the parent item
    const item = await InventoryItem.create(
      {
        name,
        sku,
        category,
        description: description || null,
        unit,
        remaining_stock: has_variants ? 0 : (remaining_stock || 0),
        min_stock_level: min_stock_level ?? reorder_level ?? 0,
        reorder_amount: reorder_amount ?? 0,
        unit_price: unit_price ?? base_price ?? 0,
        vendor_name: vendor_name || null,
        vendor_contact: vendor_contact || null,
        rack_location: rack_location || null,
        image_url: image_url || null,
        linked_product_id: linked_product_id || null,
        has_variants: !!has_variants,
        notes: notes || null,
        is_active: true,
      },
      { transaction: t }
    );

    // Create variants if applicable
    if (has_variants && variants && variants.length > 0) {
      const variantRecords = variants.map((v) => ({
        inventory_item_id: item.id,
        size: v.size,
        sku: v.sku || null,
        remaining_stock: v.remaining_stock || 0,
        reorder_level: v.reorder_level || 0,
        reorder_amount: v.reorder_amount || 0,
        price: v.price ?? null,
        image_url: v.image_url || null,
        is_active: true,
      }));

      await InventoryItemVariant.bulkCreate(variantRecords, { transaction: t });
    }

    // Re-fetch with variants included
    return InventoryItem.findByPk(item.id, {
      include: [variantsInclude],
      transaction: t,
    });
  });

  return result.toJSON();
}

// =========================================================================
// Update Item
// =========================================================================

/**
 * Update an existing inventory item (partial update).
 *
 * @param {string} itemId - UUID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated item JSON
 */
async function updateItem(itemId, updates) {
  const item = await InventoryItem.findByPk(itemId, {
    include: [variantsInclude],
  });

  if (!item) {
    throw serviceError("Inventory item not found", 404, "ITEM_NOT_FOUND");
  }

  // If SKU is changing, check uniqueness
  if (updates.sku && updates.sku !== item.sku) {
    const dup = await InventoryItem.findOne({ where: { sku: updates.sku } });
    if (dup) {
      throw serviceError(`An item with SKU ${updates.sku} already exists`, 400, "DUPLICATE_SKU");
    }
  }

  // Handle frontend alias: reorder_level → min_stock_level
  if (updates.reorder_level !== undefined && updates.min_stock_level === undefined) {
    updates.min_stock_level = updates.reorder_level;
  }
  delete updates.reorder_level;

  // Handle frontend alias: base_price → unit_price
  if (updates.base_price !== undefined && updates.unit_price === undefined) {
    updates.unit_price = updates.base_price;
  }
  delete updates.base_price;

  // reorder_amount is stored directly (same name in frontend and DB)

  await sequelize.transaction(async (t) => {
    // Update variants if provided
    if (updates.variants && Array.isArray(updates.variants)) {
      for (const v of updates.variants) {
        if (v.id || v.variant_id) {
          // Update existing variant
          await InventoryItemVariant.update(
            {
              size: v.size,
              sku: v.sku,
              remaining_stock: v.remaining_stock,
              reorder_level: v.reorder_level,
              reorder_amount: v.reorder_amount,
              price: v.price,
              image_url: v.image_url,
            },
            { where: { id: v.id || v.variant_id }, transaction: t }
          );
        } else {
          // Create new variant
          await InventoryItemVariant.create(
            {
              inventory_item_id: itemId,
              size: v.size,
              sku: v.sku || null,
              remaining_stock: v.remaining_stock || 0,
              reorder_level: v.reorder_level || 0,
              reorder_amount: v.reorder_amount || 0,
              price: v.price ?? null,
              image_url: v.image_url || null,
            },
            { transaction: t }
          );
        }
      }
      delete updates.variants;
    }

    // Remove computed / read-only fields that shouldn't be saved
    delete updates.total_stock;
    delete updates.is_low_stock;
    delete updates.id;
    delete updates.created_at;

    await item.update(updates, { transaction: t });
  });

  // Re-fetch with fresh variants
  const updated = await InventoryItem.findByPk(itemId, {
    include: [variantsInclude],
  });

  return updated.toJSON();
}

// =========================================================================
// Delete (Soft Delete)
// =========================================================================

/**
 * Soft-delete an inventory item.
 * Items with stock movements cannot be hard-deleted — they get deactivated.
 *
 * @param {string} itemId - UUID
 */
async function deleteItem(itemId) {
  const item = await InventoryItem.findByPk(itemId);

  if (!item) {
    throw serviceError("Inventory item not found", 404, "ITEM_NOT_FOUND");
  }

  // Check if item has movement history
  const movementCount = await InventoryMovement.count({
    where: { inventory_item_id: itemId },
  });

  if (movementCount > 0) {
    // Soft delete — deactivate instead of removing
    await item.update({ is_active: false });
    return { soft_deleted: true, message: "Item deactivated (has transaction history)" };
  }

  // Hard delete (no history)
  await sequelize.transaction(async (t) => {
    // Delete variants first
    await InventoryItemVariant.destroy({
      where: { inventory_item_id: itemId },
      transaction: t,
    });
    await item.destroy({ transaction: t });
  });

  return { soft_deleted: false, message: "Item deleted permanently" };
}

// =========================================================================
// Stock-In
// =========================================================================

/**
 * Record a stock-in transaction.
 *
 * For simple items: increases remaining_stock.
 * For variant items: increases the specified variant's remaining_stock.
 *
 * @param {string} itemId - UUID
 * @param {Object} stockData - { quantity, variant_id?, reference_number?, notes? }
 * @param {string} performedBy - User UUID
 * @returns {Promise<Object>} { item, movement, new_stock_level }
 */
async function recordStockIn(itemId, stockData, performedBy) {
  const { quantity, variant_id, reference_number, notes } = stockData;

  if (!quantity || quantity <= 0) {
    throw serviceError("Quantity must be a positive number", 400, "INVALID_QUANTITY");
  }

  const item = await InventoryItem.findByPk(itemId, {
    include: [variantsInclude],
  });

  if (!item) {
    throw serviceError("Inventory item not found", 404, "ITEM_NOT_FOUND");
  }

  let newStockLevel = 0;

  const result = await sequelize.transaction(async (t) => {
    if (item.has_variants) {
      // ── Variant item ──
      if (!variant_id) {
        throw serviceError(
          "variant_id is required for items with size variants",
          400,
          "VARIANT_REQUIRED"
        );
      }

      const variant = await InventoryItemVariant.findOne({
        where: { id: variant_id, inventory_item_id: itemId },
        transaction: t,
      });

      if (!variant) {
        throw serviceError(
          `No variant with ID ${variant_id} exists for this item`,
          404,
          "VARIANT_NOT_FOUND"
        );
      }

      newStockLevel = parseFloat(variant.remaining_stock) + quantity;
      await variant.update({ remaining_stock: newStockLevel }, { transaction: t });
    } else {
      // ── Simple item ──
      newStockLevel = parseFloat(item.remaining_stock) + quantity;
      await item.update({ remaining_stock: newStockLevel }, { transaction: t });
    }

    // Create movement record
    const movement = await InventoryMovement.create(
      {
        inventory_item_id: itemId,
        movement_type: "STOCK_IN",
        quantity,
        remaining_after: newStockLevel,
        reference_type: "PURCHASE",
        reference_id: null,
        variant_id: variant_id || null,
        notes: notes || "Stock-in transaction",
        performed_by: performedBy || null,
        transaction_date: new Date(),
      },
      { transaction: t }
    );

    return movement;
  });

  // Re-fetch item with updated stock
  const updatedItem = await InventoryItem.findByPk(itemId, {
    include: [variantsInclude],
  });

  return {
    item: updatedItem.toJSON(),
    movement: result.toJSON(),
    new_stock_level: newStockLevel,
  };
}

// =========================================================================
// Stock-Out
// =========================================================================

/**
 * Record a stock-out transaction.
 * Validates sufficient stock before deducting.
 *
 * @param {string} itemId - UUID
 * @param {Object} stockData - { quantity, variant_id?, reference_number?, notes? }
 * @param {string} performedBy - User UUID
 * @returns {Promise<Object>} { item, movement, new_stock_level }
 */
async function recordStockOut(itemId, stockData, performedBy) {
  const { quantity, variant_id, reference_number, notes } = stockData;

  if (!quantity || quantity <= 0) {
    throw serviceError("Quantity must be a positive number", 400, "INVALID_QUANTITY");
  }

  const item = await InventoryItem.findByPk(itemId, {
    include: [variantsInclude],
  });

  if (!item) {
    throw serviceError("Inventory item not found", 404, "ITEM_NOT_FOUND");
  }

  let newStockLevel = 0;

  const result = await sequelize.transaction(async (t) => {
    if (item.has_variants) {
      if (!variant_id) {
        throw serviceError(
          "variant_id is required for items with size variants",
          400,
          "VARIANT_REQUIRED"
        );
      }

      const variant = await InventoryItemVariant.findOne({
        where: { id: variant_id, inventory_item_id: itemId },
        transaction: t,
      });

      if (!variant) {
        throw serviceError(
          `No variant with ID ${variant_id} exists for this item`,
          404,
          "VARIANT_NOT_FOUND"
        );
      }

      if (parseFloat(variant.remaining_stock) < quantity) {
        throw serviceError(
          `Only ${variant.remaining_stock} ${item.unit} available, cannot deduct ${quantity}`,
          400,
          "INSUFFICIENT_STOCK"
        );
      }

      newStockLevel = parseFloat(variant.remaining_stock) - quantity;
      await variant.update({ remaining_stock: newStockLevel }, { transaction: t });
    } else {
      if (parseFloat(item.remaining_stock) < quantity) {
        throw serviceError(
          `Only ${item.remaining_stock} ${item.unit} available, cannot deduct ${quantity}`,
          400,
          "INSUFFICIENT_STOCK"
        );
      }

      newStockLevel = parseFloat(item.remaining_stock) - quantity;
      await item.update({ remaining_stock: newStockLevel }, { transaction: t });
    }

    const movement = await InventoryMovement.create(
      {
        inventory_item_id: itemId,
        movement_type: "STOCK_OUT",
        quantity,
        remaining_after: newStockLevel,
        reference_type: reference_number ? "ORDER" : null,
        reference_id: null,
        variant_id: variant_id || null,
        notes: notes || "Stock-out transaction",
        performed_by: performedBy || null,
        transaction_date: new Date(),
      },
      { transaction: t }
    );

    return movement;
  });

  const updatedItem = await InventoryItem.findByPk(itemId, {
    include: [variantsInclude],
  });

  return {
    item: updatedItem.toJSON(),
    movement: result.toJSON(),
    new_stock_level: newStockLevel,
  };
}

// =========================================================================
// Low Stock Items
// =========================================================================

/**
 * Get all items below their reorder threshold, sorted by urgency.
 *
 * @returns {Promise<Object>} { items, total_low_stock_items, requires_immediate_attention }
 */
async function getLowStockItems() {
  const allItems = await InventoryItem.findAll({
    where: { is_active: true },
    include: [variantsInclude],
    order: [["name", "ASC"]],
  });

  const lowStockItems = allItems
    .map((item) => {
      const json = item.toJSON();
      if (!json.is_low_stock) return null;

      // Calculate urgency score
      let urgencyScore = 0;
      let criticalVariants = [];

      if (json.has_variants && json.variants) {
        criticalVariants = json.variants.filter(
          (v) => parseFloat(v.remaining_stock) < parseFloat(v.reorder_level)
        );
        urgencyScore = criticalVariants.reduce((score, v) => {
          const pctBelow =
            ((parseFloat(v.reorder_level) - parseFloat(v.remaining_stock)) /
              parseFloat(v.reorder_level)) *
            100;
          return Math.max(score, pctBelow);
        }, 0);
      } else {
        urgencyScore =
          ((json.reorder_level - json.remaining_stock) / json.reorder_level) * 100;
      }

      return {
        ...json,
        urgency_score: Math.round(urgencyScore * 100) / 100,
        critical_variants: criticalVariants,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.urgency_score - a.urgency_score);

  return {
    items: lowStockItems,
    total_low_stock_items: lowStockItems.length,
    requires_immediate_attention: lowStockItems.filter((i) => i.urgency_score > 50).length,
  };
}

// =========================================================================
// Stock Movements History
// =========================================================================

/**
 * Get movement history for a specific inventory item.
 *
 * @param {string} itemId - UUID
 * @returns {Promise<Object>} { item_id, item_name, movements, total_movements }
 */
async function getStockMovements(itemId) {
  const item = await InventoryItem.findByPk(itemId);

  if (!item) {
    throw serviceError("Inventory item not found", 404, "ITEM_NOT_FOUND");
  }

  const movements = await InventoryMovement.findAll({
    where: { inventory_item_id: itemId },
    include: [
      {
        model: require("../models").User,
        as: "performer",
        attributes: ["id", "name"],
        required: false,
      },
    ],
    order: [["transaction_date", "DESC"]],
  });

  return {
    item_id: itemId,
    item_name: item.name,
    movements: movements.map((m) => m.toJSON()),
    total_movements: movements.length,
  };
}

// =========================================================================
// Ready Stock by Product
// =========================================================================

/**
 * Get READY_STOCK items filtered by linked product.
 *
 * @param {string} productId - UUID (optional)
 * @returns {Promise<Array>}
 */
async function getReadyStockItems(productId) {
  const where = { category: "READY_STOCK", is_active: true };

  if (productId) {
    where.linked_product_id = productId;
  }

  const items = await InventoryItem.findAll({
    where,
    include: [variantsInclude],
    order: [["name", "ASC"]],
  });

  return items.map((i) => i.toJSON());
}

// =========================================================================
// Exports
// =========================================================================

module.exports = {
  listItems,
  getItemById,
  createItem,
  updateItem,
  deleteItem,
  recordStockIn,
  recordStockOut,
  getLowStockItems,
  getStockMovements,
  getReadyStockItems,
};