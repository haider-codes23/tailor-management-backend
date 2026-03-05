/**
 * Inventory Controller
 *
 * Thin HTTP layer that delegates to inventoryService.
 * Handles request parsing and response formatting.
 *
 * Response format matches frontend expectations:
 *   { success: true, data: ..., meta?: ..., message?: ... }
 */

const inventoryService = require("../services/inventoryService");

// =========================================================================
// GET /api/inventory — List items with filters
// =========================================================================

async function listItems(req, res, next) {
  try {
    const { category, search, low_stock } = req.query;
    const result = await inventoryService.listItems({ category, search, low_stock });

    return res.status(200).json({
      success: true,
      data: result.items,
      meta: {
        total: result.total,
        filters_applied: result.filters_applied,
      },
    });
  } catch (error) {
    next(error);
  }
}

// =========================================================================
// GET /api/inventory/low-stock — Low stock items
// =========================================================================

async function getLowStockItems(req, res, next) {
  try {
    const result = await inventoryService.getLowStockItems();

    return res.status(200).json({
      success: true,
      data: result.items,
      meta: {
        total_low_stock_items: result.total_low_stock_items,
        requires_immediate_attention: result.requires_immediate_attention,
      },
    });
  } catch (error) {
    next(error);
  }
}

// =========================================================================
// GET /api/inventory/ready-stock — Ready stock items (optionally by product)
// =========================================================================

async function getReadyStockItems(req, res, next) {
  try {
    const { product_id } = req.query;
    const items = await inventoryService.getReadyStockItems(product_id);

    return res.status(200).json({
      success: true,
      data: items,
    });
  } catch (error) {
    next(error);
  }
}

// =========================================================================
// GET /api/inventory/:id — Item detail
// =========================================================================

async function getItem(req, res, next) {
  try {
    const item = await inventoryService.getItemById(req.params.id);

    return res.status(200).json({
      success: true,
      data: item,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

// =========================================================================
// POST /api/inventory — Create item
// =========================================================================

async function createItem(req, res, next) {
  try {
    const item = await inventoryService.createItem(req.body);

    return res.status(201).json({
      success: true,
      data: item,
      message: "Inventory item created successfully",
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.code || "CREATE_ERROR",
        message: error.message,
      });
    }
    next(error);
  }
}

// =========================================================================
// PUT /api/inventory/:id — Update item
// =========================================================================

async function updateItem(req, res, next) {
  try {
    const item = await inventoryService.updateItem(req.params.id, req.body);

    return res.status(200).json({
      success: true,
      data: item,
      message: "Inventory item updated successfully",
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.code || "UPDATE_ERROR",
        message: error.message,
      });
    }
    next(error);
  }
}

// =========================================================================
// DELETE /api/inventory/:id — Soft delete
// =========================================================================

async function deleteItem(req, res, next) {
  try {
    const result = await inventoryService.deleteItem(req.params.id);

    return res.status(200).json({
      success: true,
      data: result,
      message: result.message,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.code || "DELETE_ERROR",
        message: error.message,
      });
    }
    next(error);
  }
}

// =========================================================================
// POST /api/inventory/:id/stock-in — Record stock received
// =========================================================================

async function recordStockIn(req, res, next) {
  try {
    const result = await inventoryService.recordStockIn(
      req.params.id,
      req.body,
      req.user?.id || null
    );

    return res.status(200).json({
      success: true,
      data: result,
      message: `Successfully added ${req.body.quantity} to inventory`,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.code || "STOCK_IN_ERROR",
        message: error.message,
      });
    }
    next(error);
  }
}

// =========================================================================
// POST /api/inventory/:id/stock-out — Record stock consumed
// =========================================================================

async function recordStockOut(req, res, next) {
  try {
    const result = await inventoryService.recordStockOut(
      req.params.id,
      req.body,
      req.user?.id || null
    );

    return res.status(200).json({
      success: true,
      data: result,
      message: `Successfully deducted ${req.body.quantity} from inventory`,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.code || "STOCK_OUT_ERROR",
        message: error.message,
      });
    }
    next(error);
  }
}

// =========================================================================
// GET /api/inventory/:id/movements — Stock movement history
// =========================================================================

async function getStockMovements(req, res, next) {
  try {
    const result = await inventoryService.getStockMovements(req.params.id);

    return res.status(200).json({
      success: true,
      data: result,
      meta: {
        total_movements: result.total_movements,
      },
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        error: error.message,
      });
    }
    next(error);
  }
}

// =========================================================================
// Exports
// =========================================================================

module.exports = {
  listItems,
  getLowStockItems,
  getReadyStockItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  recordStockIn,
  recordStockOut,
  getStockMovements,
};