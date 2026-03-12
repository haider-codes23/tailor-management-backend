/**
 * Product Service
 *
 * Business logic for Products, BOMs, BOM Items, and Measurement Charts.
 * Mirrors the logic from frontend MSW productsHandlers.js.
 *
 * Sections:
 *   A. Product CRUD
 *   B. BOM CRUD (size-based, versioned)
 *   C. BOM Items CRUD
 *   D. Measurement Charts (size chart + height chart)
 *   E. Ready Stock helpers
 *   F. BOM Calculator utility
 */

const { Op, literal } = require("sequelize");
const {
  sequelize,
  Product,
  Bom,
  BomItem,
  InventoryItem,
  InventoryItemVariant,
  ProductSizeChartRow,
  ProductHeightChartRow,
  User,
} = require("../models");

// =========================================================================
// Helpers
// =========================================================================

function serviceError(message, status = 400, code = "PRODUCT_ERROR") {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

// =========================================================================
// A. PRODUCT CRUD
// =========================================================================

/**
 * List products with optional filters.
 * Mirrors: GET /products?search=&category=&active=
 */
async function listProducts({ search, category, active } = {}) {
  const where = {};

  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: s } },
      { sku: { [Op.iLike]: s } },
      { description: { [Op.iLike]: s } },
    ];
  }

  if (category && category !== "ALL") {
    where.category = category;
  }

  if (active !== undefined && active !== null && active !== "") {
    where.is_active = active === "true" || active === true;
  }

  const products = await Product.findAll({
    where,
    order: [["created_at", "DESC"]],
  });

  return {
    products: products.map((p) => p.toJSON()),
    total: products.length,
  };
}

/**
 * Get a single product by ID.
 * Mirrors: GET /products/:id
 */
async function getProductById(productId) {
  const product = await Product.findByPk(productId);

  if (!product) {
    throw serviceError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  return product.toJSON();
}

/**
 * Create a new product.
 * Mirrors: POST /products
 */
async function createProduct(data) {
  // Check for duplicate SKU
  const existing = await Product.findOne({ where: { sku: data.sku } });
  if (existing) {
    throw serviceError(
      `A product with SKU "${data.sku}" already exists`,
      409,
      "DUPLICATE_SKU"
    );
  }

  // Compute pricing from product_items + add_ons (matches MSW handler logic)
  const productItems = data.product_items || [];
  const addOns = data.add_ons || [];
  const subtotal = [...productItems, ...addOns].reduce(
    (sum, item) => sum + (parseFloat(item.price) || 0), 0
  );
  const discount = parseFloat(data.discount) || 0;
  const totalPrice = subtotal - discount;

  const product = await Product.create({
    name: data.name,
    sku: data.sku,
    description: data.description || null,
    category: data.category || null,
    images: data?.images?.length ? data.images : data.image_url ? [data.image_url] : [],
    product_items: productItems,
    add_ons: addOns,
    subtotal,
    discount,
    total_price: totalPrice,
    shopify_product_id: data.shopify_product_id || null,
    shopify_variant_id: data.shopify_variant_id || null,
    is_active: data.is_active !== undefined ? data.is_active : true,
  });

  return product.toJSON();
}

/**
 * Update an existing product.
 * Mirrors: PUT /products/:id
 */
async function updateProduct(productId, data) {
  const product = await Product.findByPk(productId);
  if (!product) {
    throw serviceError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  // If SKU is changing, check for duplicates
  if (data.sku && data.sku !== product.sku) {
    const existing = await Product.findOne({
      where: { sku: data.sku, id: { [Op.ne]: productId } },
    });
    if (existing) {
      throw serviceError(
        `A product with SKU "${data.sku}" already exists`,
        409,
        "DUPLICATE_SKU"
      );
    }
  }

  // Only update provided fields
  const updateFields = {};

  // Convert frontend's image_url → images JSONB array
    if (data.image_url !== undefined) {
      data.images = data.image_url ? [data.image_url] : [];
    }

  const allowedFields = [
    "name",
    "sku",
    "description",
    "category",
    "images",
    "product_items",
    "add_ons",
    "shopify_product_id",
    "shopify_variant_id",
    "is_active",
    "discount",
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updateFields[field] = data[field];
    }
  }

  // Recompute pricing if product_items, add_ons, or discount changed
  if (data.product_items !== undefined || data.add_ons !== undefined || data.discount !== undefined) {
    const items = updateFields.product_items || product.product_items || [];
    const addOns = updateFields.add_ons || product.add_ons || [];
    const subtotal = [...items, ...addOns].reduce(
      (sum, i) => sum + (parseFloat(i.price) || 0), 0
    );
    const disc = parseFloat(updateFields.discount ?? product.discount) || 0;
    updateFields.subtotal = subtotal;
    updateFields.total_price = subtotal - disc;
  }

  await product.update(updateFields);
  return product.toJSON();
}

/**
 * Soft delete a product.
 * Mirrors: DELETE /products/:id (rejects if BOMs exist)
 */
async function deleteProduct(productId) {
  const product = await Product.findByPk(productId);
  if (!product) {
    throw serviceError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  // Check if product has any BOMs
  const bomCount = await Bom.count({ where: { product_id: productId } });
  if (bomCount > 0) {
    throw serviceError(
      "Cannot delete product with existing BOMs. Please delete all BOMs first or mark the product as inactive.",
      400,
      "HAS_BOMS"
    );
  }

  await product.update({ is_active: false });

  return { id: productId, message: "Product deactivated successfully" };
}

// =========================================================================
// B. BOM CRUD (Size-Based, Versioned)
// =========================================================================

/**
 * Get all BOMs for a product, optionally filtered by size.
 * Mirrors: GET /products/:productId/boms?size=
 */
async function getProductBOMs(productId, size = null) {
  const product = await Product.findByPk(productId);
  if (!product) {
    throw serviceError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  const where = { product_id: productId };
  if (size) {
    where.size = size;
  }

  const boms = await Bom.findAll({
    where,
    include: [
      {
        model: BomItem,
        as: "items",
        include: [
          {
            model: InventoryItem,
            as: "inventoryItem",
            attributes: ["id", "name", "sku", "category", "unit", "remaining_stock"],
          },
        ],
      },
    ],
    order: [
      ["size", "ASC"],
      ["version", "DESC"],
    ],
  });

  // Collect available sizes
  const allSizes = await Bom.findAll({
    where: { product_id: productId },
    attributes: [[sequelize.fn("DISTINCT", sequelize.col("size")), "size"]],
    raw: true,
  });

  return {
    boms: boms.map((b) => b.toJSON()),
    available_sizes: allSizes.map((s) => s.size).filter(Boolean).sort(),
    total: boms.length,
  };
}

/**
 * Get active BOM(s) for a product.
 * If size given: returns single active BOM for that size.
 * If no size: returns all active BOMs.
 * Mirrors: GET /products/:productId/boms/active?size=
 */
async function getActiveBOM(productId, size = null) {
  const product = await Product.findByPk(productId);
  if (!product) {
    throw serviceError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  const where = { product_id: productId, is_active: true };
  if (size) {
    where.size = size;
  }

  const boms = await Bom.findAll({
    where,
    include: [
      {
        model: BomItem,
        as: "items",
        include: [
          {
            model: InventoryItem,
            as: "inventoryItem",
            attributes: ["id", "name", "sku", "category", "unit", "remaining_stock"],
          },
        ],
      },
    ],
    order: [["size", "ASC"]],
  });

  if (size) {
    // Return single BOM or null
    return boms.length > 0 ? boms[0].toJSON() : null;
  }

  return boms.map((b) => b.toJSON());
}

/**
 * Get a single BOM by ID with items.
 * Mirrors: GET /boms/:bomId
 */
async function getBOMById(bomId) {
  const bom = await Bom.findByPk(bomId, {
    include: [
      {
        model: BomItem,
        as: "items",
        include: [
          {
            model: InventoryItem,
            as: "inventoryItem",
            attributes: ["id", "name", "sku", "category", "unit", "remaining_stock"],
          },
        ],
      },
    ],
  });

  if (!bom) {
    throw serviceError("BOM not found", 404, "BOM_NOT_FOUND");
  }

  return bom.toJSON();
}

/**
 * Create a new BOM for a product + size.
 * Mirrors: POST /products/:productId/boms
 *
 * Creating a new active BOM deactivates the previous one for that size.
 */
async function createBOM(productId, data, userId = null) {
  const product = await Product.findByPk(productId);
  if (!product) {
    throw serviceError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  if (!data.size) {
    throw serviceError("Size is required", 400, "SIZE_REQUIRED");
  }

  const t = await sequelize.transaction();

  try {
    // Deactivate current active BOM for this product + size
    await Bom.deactivateForProductSize(productId, data.size, t);

    // Get next version
    const nextVersion = await Bom.getNextVersion(productId, data.size);

    // Auto-populate pieces from product
    const pieces = product.getAllPieces();

    const bom = await Bom.create(
      {
        product_id: productId,
        size: data.size,
        version: nextVersion,
        is_active: true,
        name: data.name || `Size ${data.size} - Version ${nextVersion}`,
        notes: data.notes || null,
        pieces,
        created_by: userId,
      },
      { transaction: t }
    );

    await t.commit();

    // Reload with items (empty for new BOM)
    return await getBOMById(bom.id);
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

/**
 * Update an existing BOM.
 * Mirrors: PUT /boms/:bomId
 */
async function updateBOM(bomId, data) {
  const bom = await Bom.findByPk(bomId);
  if (!bom) {
    throw serviceError("BOM not found", 404, "BOM_NOT_FOUND");
  }

  const updateFields = {};
  if (data.name !== undefined) updateFields.name = data.name;
  if (data.notes !== undefined) updateFields.notes = data.notes;
  if (data.is_active !== undefined) updateFields.is_active = data.is_active;

  await bom.update(updateFields);
  return await getBOMById(bomId);
}

/**
 * Delete a BOM and all its items.
 * Mirrors: DELETE /boms/:bomId
 */
async function deleteBOM(bomId) {
  const bom = await Bom.findByPk(bomId, {
    include: [{ model: BomItem, as: "items" }],
  });

  if (!bom) {
    throw serviceError("BOM not found", 404, "BOM_NOT_FOUND");
  }

  const t = await sequelize.transaction();
  try {
    // Delete items first
    await BomItem.destroy({ where: { bom_id: bomId }, transaction: t });
    // Delete BOM
    await bom.destroy({ transaction: t });
    await t.commit();

    return { id: bomId, message: "BOM deleted successfully" };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// =========================================================================
// C. BOM ITEMS CRUD
// =========================================================================

/**
 * Get all items for a BOM, enriched with inventory details.
 * Mirrors: GET /boms/:bomId/items
 */
async function getBOMItems(bomId) {
  const bom = await Bom.findByPk(bomId);
  if (!bom) {
    throw serviceError("BOM not found", 404, "BOM_NOT_FOUND");
  }

  const items = await BomItem.findAll({
    where: { bom_id: bomId },
    include: [
      {
        model: InventoryItem,
        as: "inventoryItem",
        attributes: ["id", "name", "sku", "category", "unit", "remaining_stock"],
      },
    ],
    order: [["piece", "ASC"]],
  });

  // Enrich with inventory details for frontend compatibility
  return items.map((item) => {
    const json = item.toJSON();
    const inv = json.inventoryItem;
    return {
      ...json,
      inventory_item_name: inv?.name || `Unknown Item ${json.inventory_item_id}`,
      inventory_item_sku: inv?.sku || "",
      inventory_item_category: inv?.category || "",
      unit: json.unit || inv?.unit || "Unit",
      available_stock: inv?.remaining_stock || 0,
    };
  });
}

/**
 * Add a BOM item.
 * Mirrors: POST /boms/:bomId/items
 *
 * Validates that inventory item category is allowed for BOMs.
 */
async function addBOMItem(bomId, data) {
  const bom = await Bom.findByPk(bomId);
  if (!bom) {
    throw serviceError("BOM not found", 404, "BOM_NOT_FOUND");
  }

  // Validate inventory item exists and has allowed category
  const inventoryItem = await InventoryItem.findByPk(data.inventory_item_id);
  if (!inventoryItem) {
    throw serviceError("Inventory item not found", 404, "INVENTORY_ITEM_NOT_FOUND");
  }

  if (!BomItem.ALLOWED_CATEGORIES.includes(inventoryItem.category)) {
    throw serviceError(
      `Inventory items of category "${inventoryItem.category}" cannot be used in BOMs. Allowed: ${BomItem.ALLOWED_CATEGORIES.join(", ")}`,
      400,
      "INVALID_CATEGORY"
    );
  }

  // Validate piece is in the BOM's pieces list
  if (data.piece && bom.pieces && bom.pieces.length > 0 && !bom.pieces.includes(data.piece)) {
    throw serviceError(
      `Piece "${data.piece}" is not part of this BOM. Valid pieces: ${bom.pieces.join(", ")}`,
      400,
      "INVALID_PIECE"
    );
  }

  const item = await BomItem.create({
    bom_id: bomId,
    inventory_item_id: data.inventory_item_id,
    piece: data.piece,
    quantity_per_unit: data.quantity_per_unit,
    unit: data.unit || null,
    notes: data.notes || null,
  });

  // Return enriched
  const created = await BomItem.findByPk(item.id, {
    include: [
      {
        model: InventoryItem,
        as: "inventoryItem",
        attributes: ["id", "name", "sku", "category", "unit", "remaining_stock"],
      },
    ],
  });

  const json = created.toJSON();
  const inv = json.inventoryItem;
  return {
    ...json,
    inventory_item_name: inv?.name || "",
    inventory_item_sku: inv?.sku || "",
    inventory_item_category: inv?.category || "",
    unit: json.unit || inv?.unit || "Unit",
    available_stock: inv?.remaining_stock || 0,
  };
}

/**
 * Update a BOM item.
 * Mirrors: PUT /bom-items/:itemId
 */
async function updateBOMItem(itemId, data) {
  const item = await BomItem.findByPk(itemId);
  if (!item) {
    throw serviceError("BOM item not found", 404, "BOM_ITEM_NOT_FOUND");
  }

  // If changing inventory item, validate category
  if (data.inventory_item_id && data.inventory_item_id !== item.inventory_item_id) {
    const inventoryItem = await InventoryItem.findByPk(data.inventory_item_id);
    if (!inventoryItem) {
      throw serviceError("Inventory item not found", 404, "INVENTORY_ITEM_NOT_FOUND");
    }
    if (!BomItem.ALLOWED_CATEGORIES.includes(inventoryItem.category)) {
      throw serviceError(
        `Inventory items of category "${inventoryItem.category}" cannot be used in BOMs`,
        400,
        "INVALID_CATEGORY"
      );
    }
  }

  const updateFields = {};
  if (data.inventory_item_id !== undefined) updateFields.inventory_item_id = data.inventory_item_id;
  if (data.piece !== undefined) updateFields.piece = data.piece;
  if (data.quantity_per_unit !== undefined) updateFields.quantity_per_unit = data.quantity_per_unit;
  if (data.unit !== undefined) updateFields.unit = data.unit;
  if (data.notes !== undefined) updateFields.notes = data.notes;

  await item.update(updateFields);

  // Return enriched
  const updated = await BomItem.findByPk(itemId, {
    include: [
      {
        model: InventoryItem,
        as: "inventoryItem",
        attributes: ["id", "name", "sku", "category", "unit", "remaining_stock"],
      },
    ],
  });

  const json = updated.toJSON();
  const inv = json.inventoryItem;
  return {
    ...json,
    inventory_item_name: inv?.name || "",
    inventory_item_sku: inv?.sku || "",
    inventory_item_category: inv?.category || "",
    unit: json.unit || inv?.unit || "Unit",
    available_stock: inv?.remaining_stock || 0,
  };
}

/**
 * Delete a BOM item.
 * Mirrors: DELETE /bom-items/:itemId
 */
async function deleteBOMItem(itemId) {
  const item = await BomItem.findByPk(itemId);
  if (!item) {
    throw serviceError("BOM item not found", 404, "BOM_ITEM_NOT_FOUND");
  }

  await item.destroy();
  return { id: itemId, message: "BOM item deleted successfully" };
}

// =========================================================================
// D. MEASUREMENT CHARTS
// =========================================================================

/**
 * Get measurement charts for a product.
 * Mirrors: GET /products/:productId/measurement-charts
 */
async function getMeasurementCharts(productId) {
  const product = await Product.findByPk(productId, {
    include: [
      {
        model: ProductSizeChartRow,
        as: "sizeChartRows",
        order: [["sequence", "ASC"]],
      },
      {
        model: ProductHeightChartRow,
        as: "heightChartRows",
        order: [["sequence", "ASC"]],
      },
    ],
    order: [
      [{ model: ProductSizeChartRow, as: "sizeChartRows" }, "sequence", "ASC"],
      [{ model: ProductHeightChartRow, as: "heightChartRows" }, "sequence", "ASC"],
    ],
  });

  if (!product) {
    throw serviceError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  return {
    has_size_chart: product.has_size_chart,
    has_height_chart: product.has_height_chart,
    enabled_size_fields: product.enabled_size_fields,
    enabled_height_fields: product.enabled_height_fields,
    size_chart: product.has_size_chart
      ? { rows: product.sizeChartRows.map((r) => r.toJSON()) }
      : null,
    height_chart: product.has_height_chart
      ? { rows: product.heightChartRows.map((r) => r.toJSON()) }
      : null,
  };
}

/**
 * Update size chart for a product.
 * Mirrors: PUT /products/:productId/measurement-charts/size-chart
 *
 * Receives { rows: [...], enabled_fields: [...] }
 * Upserts rows into product_size_chart_rows (match by product_id + size_code)
 */
async function updateSizeChart(productId, data) {
  const product = await Product.findByPk(productId);
  if (!product) {
    throw serviceError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  if (!data.rows || !Array.isArray(data.rows)) {
    throw serviceError("Invalid data format. Expected rows array.", 400, "INVALID_FORMAT");
  }

  const t = await sequelize.transaction();
  try {
    // Upsert each row
    for (const row of data.rows) {
      const [existing] = await ProductSizeChartRow.findOrCreate({
        where: { product_id: productId, size_code: row.size_code },
        defaults: { ...row, product_id: productId },
        transaction: t,
      });

      if (existing) {
        await existing.update(
          {
            shoulder: row.shoulder ?? existing.shoulder,
            bust: row.bust ?? existing.bust,
            waist: row.waist ?? existing.waist,
            hip: row.hip ?? existing.hip,
            armhole: row.armhole ?? existing.armhole,
            uk_size: row.uk_size !== undefined ? row.uk_size : existing.uk_size,
            us_size: row.us_size !== undefined ? row.us_size : existing.us_size,
            sequence: row.sequence ?? existing.sequence,
          },
          { transaction: t }
        );
      }
    }

    // Update product flags
    await product.update(
      {
        has_size_chart: true,
        enabled_size_fields: data.enabled_fields || product.enabled_size_fields,
      },
      { transaction: t }
    );

    await t.commit();
    return await getMeasurementCharts(productId);
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

/**
 * Update height chart for a product.
 * Mirrors: PUT /products/:productId/measurement-charts/height-chart
 */
async function updateHeightChart(productId, data) {
  const product = await Product.findByPk(productId);
  if (!product) {
    throw serviceError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  if (!data.rows || !Array.isArray(data.rows)) {
    throw serviceError("Invalid data format. Expected rows array.", 400, "INVALID_FORMAT");
  }

  const t = await sequelize.transaction();
  try {
    for (const row of data.rows) {
      const [existing] = await ProductHeightChartRow.findOrCreate({
        where: { product_id: productId, height_range: row.height_range },
        defaults: { ...row, product_id: productId },
        transaction: t,
      });

      if (existing) {
        await existing.update(
          {
            height_min_inches: row.height_min_inches ?? existing.height_min_inches,
            height_max_inches: row.height_max_inches ?? existing.height_max_inches,
            kaftan_length: row.kaftan_length ?? existing.kaftan_length,
            sleeve_front_length: row.sleeve_front_length ?? existing.sleeve_front_length,
            sleeve_back_length: row.sleeve_back_length ?? existing.sleeve_back_length,
            lehnga_length: row.lehnga_length ?? existing.lehnga_length,
            sequence: row.sequence ?? existing.sequence,
          },
          { transaction: t }
        );
      }
    }

    await product.update(
      {
        has_height_chart: true,
        enabled_height_fields: data.enabled_fields || product.enabled_height_fields,
      },
      { transaction: t }
    );

    await t.commit();
    return await getMeasurementCharts(productId);
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

/**
 * Initialize measurement charts from default templates.
 * Mirrors: POST /products/:productId/measurement-charts/initialize
 */
async function initializeMeasurementCharts(productId, data) {
  const product = await Product.findByPk(productId);
  if (!product) {
    throw serviceError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  const t = await sequelize.transaction();
  try {
    // Initialize SIZE chart if requested
    if (data.initialize_size_chart === true && !product.has_size_chart) {
      const defaultRows = ProductSizeChartRow.DEFAULT_ROWS.map((r) => ({
        ...r,
        product_id: productId,
      }));

      await ProductSizeChartRow.bulkCreate(defaultRows, { transaction: t });

      await product.update(
        {
          has_size_chart: true,
          enabled_size_fields:
            data.enabled_size_fields || ProductSizeChartRow.DEFAULT_ENABLED_FIELDS,
        },
        { transaction: t }
      );
    }

    // Initialize HEIGHT chart if requested
    if (data.initialize_height_chart === true && !product.has_height_chart) {
      const defaultRows = ProductHeightChartRow.DEFAULT_ROWS.map((r) => ({
        ...r,
        product_id: productId,
      }));

      await ProductHeightChartRow.bulkCreate(defaultRows, { transaction: t });

      await product.update(
        {
          has_height_chart: true,
          enabled_height_fields:
            data.enabled_height_fields || ProductHeightChartRow.DEFAULT_ENABLED_FIELDS,
        },
        { transaction: t }
      );
    }

    await t.commit();
    return await getMeasurementCharts(productId);
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

/**
 * Remove size chart for a product.
 * Mirrors: DELETE /products/:productId/measurement-charts/size-chart
 */
async function deleteSizeChart(productId) {
  const product = await Product.findByPk(productId);
  if (!product) {
    throw serviceError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  const t = await sequelize.transaction();
  try {
    await ProductSizeChartRow.destroy({
      where: { product_id: productId },
      transaction: t,
    });

    await product.update(
      { has_size_chart: false, enabled_size_fields: [] },
      { transaction: t }
    );

    await t.commit();
    return { message: "Size chart removed successfully" };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

/**
 * Remove height chart for a product.
 * Mirrors: DELETE /products/:productId/measurement-charts/height-chart
 */
async function deleteHeightChart(productId) {
  const product = await Product.findByPk(productId);
  if (!product) {
    throw serviceError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  const t = await sequelize.transaction();
  try {
    await ProductHeightChartRow.destroy({
      where: { product_id: productId },
      transaction: t,
    });

    await product.update(
      { has_height_chart: false, enabled_height_fields: [] },
      { transaction: t }
    );

    await t.commit();
    return { message: "Height chart removed successfully" };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// =========================================================================
// E. READY STOCK HELPERS
// =========================================================================

/**
 * Get ready stock count for a product.
 * Mirrors: GET /products/:productId/ready-stock
 */
async function getReadyStockForProduct(productId) {
  const product = await Product.findByPk(productId);
  if (!product) {
    throw serviceError("Product not found", 404, "PRODUCT_NOT_FOUND");
  }

  const items = await InventoryItem.findAll({
    where: {
      linked_product_id: productId,
      category: "READY_STOCK",
      is_active: true,
    },
    include: [
      {
        model: InventoryItemVariant,
        as: "variants",
        where: { is_active: true },
        required: false,
      },
    ],
  });

  // Sum up total available (main stock + variant stocks)
  let totalAvailable = 0;
  const stockItems = items.map((item) => {
    const json = item.toJSON();
    const mainStock = parseFloat(json.remaining_stock) || 0;

    // If item has variants, sum variant stocks
    let variantStock = 0;
    if (json.variants && json.variants.length > 0) {
      variantStock = json.variants.reduce(
        (sum, v) => sum + (parseFloat(v.remaining_stock) || 0),
        0
      );
    }

    const itemTotal = json.has_variants ? variantStock : mainStock;
    totalAvailable += itemTotal;

    return {
      id: json.id,
      name: json.name,
      sku: json.sku,
      available: itemTotal,
      has_variants: json.has_variants,
      variants: json.variants,
    };
  });

  return {
    product_id: productId,
    product_name: product.name,
    total_available: totalAvailable,
    items: stockItems,
  };
}

// =========================================================================
// F. BOM CALCULATOR UTILITY
// =========================================================================

/**
 * Calculate material requirements for an array of order items.
 *
 * @param {Array} orderItems - Array of { product_id, quantity, size, bom_id? }
 * @returns {Object} { requirements: [...], shortages: [...] }
 *
 * Used by: inventory check, packet creation, procurement
 */
async function calculateMaterialRequirements(orderItems) {
  const consolidated = {}; // inventory_item_id → { required_qty, item_details }

  for (const oi of orderItems) {
    let bom;

    if (oi.bom_id) {
      // Use specific BOM
      bom = await Bom.findByPk(oi.bom_id, {
        include: [
          {
            model: BomItem,
            as: "items",
            include: [
              {
                model: InventoryItem,
                as: "inventoryItem",
                attributes: ["id", "name", "sku", "unit", "remaining_stock"],
              },
            ],
          },
        ],
      });
    } else {
      // Find active BOM for product + size
      const where = {
        product_id: oi.product_id,
        is_active: true,
      };
      if (oi.size) where.size = oi.size;

      bom = await Bom.findOne({
        where,
        include: [
          {
            model: BomItem,
            as: "items",
            include: [
              {
                model: InventoryItem,
                as: "inventoryItem",
                attributes: ["id", "name", "sku", "unit", "remaining_stock"],
              },
            ],
          },
        ],
      });
    }

    if (!bom || !bom.items || bom.items.length === 0) continue;

    const qty = oi.quantity || 1;

    for (const bomItem of bom.items) {
      const invId = bomItem.inventory_item_id;
      const requiredPerUnit = parseFloat(bomItem.quantity_per_unit) || 0;
      const totalRequired = requiredPerUnit * qty;

      if (!consolidated[invId]) {
        const inv = bomItem.inventoryItem;
        consolidated[invId] = {
          inventory_item_id: invId,
          inventory_item_name: inv?.name || "Unknown",
          inventory_item_sku: inv?.sku || "",
          unit: bomItem.unit || inv?.unit || "Unit",
          available_stock: parseFloat(inv?.remaining_stock) || 0,
          total_required: 0,
          pieces: [],
        };
      }

      consolidated[invId].total_required += totalRequired;
      consolidated[invId].pieces.push({
        piece: bomItem.piece,
        required_qty: totalRequired,
        product_id: oi.product_id,
      });
    }
  }

  const requirements = Object.values(consolidated);
  const shortages = requirements
    .filter((r) => r.total_required > r.available_stock)
    .map((r) => ({
      ...r,
      shortage_qty: r.total_required - r.available_stock,
    }));

  return { requirements, shortages };
}

// =========================================================================
// Exports
// =========================================================================

module.exports = {
  // Products
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  // BOMs
  getProductBOMs,
  getActiveBOM,
  getBOMById,
  createBOM,
  updateBOM,
  deleteBOM,
  // BOM Items
  getBOMItems,
  addBOMItem,
  updateBOMItem,
  deleteBOMItem,
  // Measurement Charts
  getMeasurementCharts,
  updateSizeChart,
  updateHeightChart,
  initializeMeasurementCharts,
  deleteSizeChart,
  deleteHeightChart,
  // Ready Stock
  getReadyStockForProduct,
  // BOM Calculator
  calculateMaterialRequirements,
};