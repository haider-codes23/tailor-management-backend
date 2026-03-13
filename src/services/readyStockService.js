/**
 * Ready Stock Service
 *
 * Handles the automatic ready stock check that runs when an order
 * enters RECEIVED status. Determines whether the order can be
 * fulfilled from finished dresses in inventory (READY_STOCK path)
 * or needs full production (PRODUCTION path).
 *
 * Ready Stock logic (from plan 8D):
 *   For each order_item:
 *     1. Find READY_STOCK inventory items where linked_product_id = item.product_id
 *     2. For variant items, match by size as well
 *     3. Sum total available ready stock
 *     4. Compare against item.quantity
 *   Evaluate:
 *     RS_OK: ALL items have sufficient stock → READY_STOCK PATH
 *     RS_NEEDS_PRODUCTION: ANY item lacks stock → PRODUCTION PATH
 *     Force Production flag → always PRODUCTION PATH
 *
 * READY_STOCK PATH:
 *   → fulfillment_source = READY_STOCK on order + items
 *   → Deduct remaining_stock on inventory items/variants
 *   → Create inventory_movements (ISSUE_READY_STOCK_TO_ORDER)
 *   → Status: RECEIVED → AWAITING_CLIENT_APPROVAL
 *
 * PRODUCTION PATH:
 *   → fulfillment_source = PRODUCTION on order + items
 *   → Status: RECEIVED (stays — frontend drives next step via customer form)
 */

const { Op } = require("sequelize");
const {
  sequelize,
  Order,
  OrderItem,
  OrderItemSection,
  OrderActivity,
  InventoryItem,
  InventoryItemVariant,
  InventoryMovement,
} = require("../models");

const {
  ORDER_STATUS,
  ORDER_ITEM_STATUS,
  FULFILLMENT_SOURCE,
  ACTIVITY_ACTION_TYPE,
} = require("../constants/order");

// =========================================================================
// Helpers
// =========================================================================

function serviceError(msg, status = 400, code = "READY_STOCK_ERROR") {
  const err = new Error(msg);
  err.status = status;
  err.code = code;
  return err;
}

// =========================================================================
// CORE: Run Ready Stock Check
// =========================================================================

/**
 * Run the automatic ready stock check for an order.
 * Called immediately after order creation (from createOrder) or
 * manually via POST /api/orders/:id/check-ready-stock.
 *
 * @param {string} orderId
 * @param {Object} opts
 * @param {boolean} opts.forceProduction - Override to skip ready stock
 * @param {Object}  opts.user - Authenticated user for logging
 * @param {Object}  opts.transaction - Optional external transaction
 * @returns {Promise<Object>} { path, order, details }
 */
async function runReadyStockCheck(orderId, { forceProduction = false, user = null, transaction: externalTx = null } = {}) {
  const useTx = externalTx || await sequelize.transaction();
  const isOwnTx = !externalTx;

  try {
    // 1. Load order with items
    const order = await Order.findByPk(orderId, {
      include: [{ model: OrderItem, as: "items" }],
      transaction: useTx,
    });

    if (!order) throw serviceError("Order not found", 404, "ORDER_NOT_FOUND");

    // Only run on RECEIVED orders
    if (order.status !== ORDER_STATUS.RECEIVED) {
      throw serviceError(
        `Ready stock check can only run on RECEIVED orders (current: ${order.status})`,
        400,
        "INVALID_ORDER_STATUS"
      );
    }

    // 2. Force production override
    if (forceProduction) {
      const result = await applyProductionPath(order, useTx, user);
      if (isOwnTx) await useTx.commit();
      return result;
    }

    // 3. Check each order item for ready stock availability
    const checkResults = [];
    let allItemsHaveStock = true;

    for (const item of order.items) {
      if (!item.product_id) {
        // No product linked — cannot check ready stock
        allItemsHaveStock = false;
        checkResults.push({
          order_item_id: item.id,
          product_id: null,
          required: item.quantity,
          available: 0,
          sufficient: false,
          reason: "No product linked to this item",
        });
        continue;
      }

      const availability = await getReadyStockAvailability(
        item.product_id,
        item.size,
        item.quantity,
        useTx
      );

      checkResults.push({
        order_item_id: item.id,
        product_id: item.product_id,
        product_name: item.product_name,
        required: item.quantity,
        available: availability.totalAvailable,
        sufficient: availability.sufficient,
        sources: availability.sources, // which inventory items/variants have stock
      });

      if (!availability.sufficient) {
        allItemsHaveStock = false;
      }
    }

    // 4. Route to appropriate path
    let result;
    if (allItemsHaveStock && order.items.length > 0) {
      result = await applyReadyStockPath(order, checkResults, useTx, user);
    } else {
      result = await applyProductionPath(order, useTx, user, checkResults);
    }

    if (isOwnTx) await useTx.commit();
    return result;
  } catch (err) {
    if (isOwnTx) await useTx.rollback();
    throw err;
  }
}

// =========================================================================
// Check availability for a single product + size
// =========================================================================

/**
 * Find READY_STOCK inventory items linked to a product and sum
 * available stock, optionally filtering by size (variant).
 *
 * @param {string} productId
 * @param {string|null} size - If provided, check variant-level stock
 * @param {number} requiredQty
 * @param {Object} transaction
 * @returns {Promise<Object>} { totalAvailable, sufficient, sources }
 */
async function getReadyStockAvailability(productId, size, requiredQty, transaction) {
  // Find all READY_STOCK inventory items linked to this product
  const readyStockItems = await InventoryItem.findAll({
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
    transaction,
  });

  const sources = [];
  let totalAvailable = 0;

  for (const rsItem of readyStockItems) {
    if (rsItem.has_variants && rsItem.variants && rsItem.variants.length > 0) {
      // Variant-based: match by size
      for (const variant of rsItem.variants) {
        const sizeMatch = !size || variant.size.toUpperCase() === size.toUpperCase();
        if (sizeMatch && parseFloat(variant.remaining_stock) > 0) {
          totalAvailable += parseFloat(variant.remaining_stock);
          sources.push({
            inventory_item_id: rsItem.id,
            inventory_item_name: rsItem.name,
            variant_id: variant.id,
            variant_size: variant.size,
            available: parseFloat(variant.remaining_stock),
            rack_location: rsItem.rack_location,
          });
        }
      }
    } else {
      // Simple item (no variants)
      if (parseFloat(rsItem.remaining_stock) > 0) {
        totalAvailable += parseFloat(rsItem.remaining_stock);
        sources.push({
          inventory_item_id: rsItem.id,
          inventory_item_name: rsItem.name,
          variant_id: null,
          variant_size: null,
          available: parseFloat(rsItem.remaining_stock),
          rack_location: rsItem.rack_location,
        });
      }
    }
  }

  return {
    totalAvailable,
    sufficient: totalAvailable >= requiredQty,
    sources,
  };
}

// =========================================================================
// Apply READY_STOCK path
// =========================================================================

async function applyReadyStockPath(order, checkResults, transaction, user) {
  const deductions = [];

  // Deduct stock for each item
  for (const check of checkResults) {
    if (!check.sufficient || !check.sources || check.sources.length === 0) continue;

    let remaining = check.required;

    for (const source of check.sources) {
      if (remaining <= 0) break;

      const deductQty = Math.min(remaining, source.available);

      if (source.variant_id) {
        // Variant deduction
        const variant = await InventoryItemVariant.findByPk(source.variant_id, { transaction });
        const newStock = parseFloat(variant.remaining_stock) - deductQty;
        await variant.update({ remaining_stock: newStock }, { transaction });

        // Also update parent's aggregate remaining_stock
        const parentItem = await InventoryItem.findByPk(source.inventory_item_id, { transaction });
        const parentNewStock = parseFloat(parentItem.remaining_stock) - deductQty;
        await parentItem.update({ remaining_stock: parentNewStock }, { transaction });

        await InventoryMovement.create({
          inventory_item_id: source.inventory_item_id,
          movement_type: "ISSUE_READY_STOCK_TO_ORDER",
          quantity: deductQty,
          remaining_after: newStock,
          reference_type: "ORDER",
          reference_id: order.id,
          variant_id: source.variant_id,
          notes: `Ready stock issued for order ${order.order_number}, item ${check.product_name}`,
          performed_by: user ? user.id : null,
          transaction_date: new Date(),
        }, { transaction });
      } else {
        // Simple item deduction
        const invItem = await InventoryItem.findByPk(source.inventory_item_id, { transaction });
        const newStock = parseFloat(invItem.remaining_stock) - deductQty;
        await invItem.update({ remaining_stock: newStock }, { transaction });

        await InventoryMovement.create({
          inventory_item_id: source.inventory_item_id,
          movement_type: "ISSUE_READY_STOCK_TO_ORDER",
          quantity: deductQty,
          remaining_after: newStock,
          reference_type: "ORDER",
          reference_id: order.id,
          variant_id: null,
          notes: `Ready stock issued for order ${order.order_number}, item ${check.product_name}`,
          performed_by: user ? user.id : null,
          transaction_date: new Date(),
        }, { transaction });
      }

      deductions.push({
        inventory_item_id: source.inventory_item_id,
        variant_id: source.variant_id,
        deducted_qty: deductQty,
        order_item_id: check.order_item_id,
      });

      remaining -= deductQty;
    }
  }

  // Update order → AWAITING_CLIENT_APPROVAL
  await order.update({
    status: ORDER_STATUS.AWAITING_CLIENT_APPROVAL,
    fulfillment_source: FULFILLMENT_SOURCE.READY_STOCK,
  }, { transaction });

  // Update all items → AWAITING_CLIENT_APPROVAL
  for (const item of order.items) {
    await item.update({
      status: ORDER_ITEM_STATUS.AWAITING_CLIENT_APPROVAL,
      fulfillment_source: FULFILLMENT_SOURCE.READY_STOCK,
    }, { transaction });
  }

  // Log
  await OrderActivity.log({
    orderId: order.id,
    action: `Ready stock check passed — all ${order.items.length} item(s) fulfilled from ready stock. Order moved to AWAITING_CLIENT_APPROVAL.`,
    actionType: ACTIVITY_ACTION_TYPE.STATUS_CHANGE,
    userId: user ? user.id : null,
    userName: user ? user.name : "System",
    details: {
      path: "READY_STOCK",
      previous_status: ORDER_STATUS.RECEIVED,
      new_status: ORDER_STATUS.AWAITING_CLIENT_APPROVAL,
      check_results: checkResults,
      deductions,
    },
    transaction,
  });

  return {
    path: "READY_STOCK",
    order_id: order.id,
    status: ORDER_STATUS.AWAITING_CLIENT_APPROVAL,
    fulfillment_source: FULFILLMENT_SOURCE.READY_STOCK,
    check_results: checkResults,
    deductions,
  };
}

// =========================================================================
// Apply PRODUCTION path
// =========================================================================

async function applyProductionPath(order, transaction, user, checkResults = []) {
  // Update order — stays RECEIVED, fulfillment set to PRODUCTION
  await order.update({
    fulfillment_source: FULFILLMENT_SOURCE.PRODUCTION,
  }, { transaction });

  // Update all items
  for (const item of order.items) {
    await item.update({
      fulfillment_source: FULFILLMENT_SOURCE.PRODUCTION,
    }, { transaction });
  }

  // Log
  await OrderActivity.log({
    orderId: order.id,
    action: `Ready stock check: insufficient ready stock — order routed to PRODUCTION path.`,
    actionType: ACTIVITY_ACTION_TYPE.STATUS_CHANGE,
    userId: user ? user.id : null,
    userName: user ? user.name : "System",
    details: {
      path: "PRODUCTION",
      check_results: checkResults,
    },
    transaction,
  });

  return {
    path: "PRODUCTION",
    order_id: order.id,
    status: ORDER_STATUS.RECEIVED,
    fulfillment_source: FULFILLMENT_SOURCE.PRODUCTION,
    check_results: checkResults,
  };
}

// =========================================================================
// Get Ready Stock Issues (movements for a RS-fulfilled order)
// =========================================================================

/**
 * Get all ISSUE_READY_STOCK_TO_ORDER movements for a given order.
 * Mirrors: GET /api/orders/:id/ready-stock-issues
 */
async function getReadyStockIssues(orderId) {
  const order = await Order.findByPk(orderId, { attributes: ["id", "fulfillment_source"] });
  if (!order) throw serviceError("Order not found", 404, "ORDER_NOT_FOUND");

  const movements = await InventoryMovement.findAll({
    where: {
      reference_type: "ORDER",
      reference_id: orderId,
      movement_type: "ISSUE_READY_STOCK_TO_ORDER",
    },
    include: [
      {
        model: InventoryItem,
        as: "inventory_item",
        attributes: ["id", "name", "sku", "rack_location", "category"],
      },
    ],
    order: [["created_at", "ASC"]],
  });

  return movements.map((m) => m.toJSON());
}

// =========================================================================
// Return Ready Stock (on order cancellation)
// =========================================================================

/**
 * Reverse ready stock deductions when a READY_STOCK order is cancelled.
 * Creates RETURN_READY_STOCK movements and restores remaining_stock.
 *
 * @param {string} orderId
 * @param {Object} user
 * @param {Object} transaction
 */
async function returnReadyStock(orderId, user, transaction) {
  // Find all issue movements for this order
  const issueMovements = await InventoryMovement.findAll({
    where: {
      reference_type: "ORDER",
      reference_id: orderId,
      movement_type: "ISSUE_READY_STOCK_TO_ORDER",
    },
    transaction,
  });

  if (issueMovements.length === 0) return [];

  const returns = [];

  for (const movement of issueMovements) {
    const qty = parseFloat(movement.quantity);

    if (movement.variant_id) {
      // Restore variant stock
      const variant = await InventoryItemVariant.findByPk(movement.variant_id, { transaction });
      if (variant) {
        const newStock = parseFloat(variant.remaining_stock) + qty;
        await variant.update({ remaining_stock: newStock }, { transaction });
      }

      // Restore parent item stock
      const parentItem = await InventoryItem.findByPk(movement.inventory_item_id, { transaction });
      if (parentItem) {
        const parentNewStock = parseFloat(parentItem.remaining_stock) + qty;
        await parentItem.update({ remaining_stock: parentNewStock }, { transaction });

        // Create return movement
        await InventoryMovement.create({
          inventory_item_id: movement.inventory_item_id,
          movement_type: "RETURN_READY_STOCK",
          quantity: qty,
          remaining_after: parentNewStock,
          reference_type: "ORDER",
          reference_id: orderId,
          variant_id: movement.variant_id,
          notes: `Ready stock returned — order cancelled`,
          performed_by: user ? user.id : null,
          transaction_date: new Date(),
        }, { transaction });

        returns.push({ inventory_item_id: movement.inventory_item_id, variant_id: movement.variant_id, qty });
      }
    } else {
      // Restore simple item stock
      const invItem = await InventoryItem.findByPk(movement.inventory_item_id, { transaction });
      if (invItem) {
        const newStock = parseFloat(invItem.remaining_stock) + qty;
        await invItem.update({ remaining_stock: newStock }, { transaction });

        await InventoryMovement.create({
          inventory_item_id: movement.inventory_item_id,
          movement_type: "RETURN_READY_STOCK",
          quantity: qty,
          remaining_after: newStock,
          reference_type: "ORDER",
          reference_id: orderId,
          variant_id: null,
          notes: `Ready stock returned — order cancelled`,
          performed_by: user ? user.id : null,
          transaction_date: new Date(),
        }, { transaction });

        returns.push({ inventory_item_id: movement.inventory_item_id, variant_id: null, qty });
      }
    }
  }

  return returns;
}

// =========================================================================
// Exports
// =========================================================================

module.exports = {
  runReadyStockCheck,
  getReadyStockAvailability,
  getReadyStockIssues,
  returnReadyStock,
};