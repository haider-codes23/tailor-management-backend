/**
 * Inventory Routes
 *
 * All routes require authentication.
 * Middleware chain: authenticate → requirePermission → [validate] → controller
 *
 * GET    /api/inventory                    inventory.view       List items (with filters)
 * GET    /api/inventory/low-stock          inventory.view       Low stock items
 * GET    /api/inventory/ready-stock        inventory.view       Ready stock items (by product)
 * GET    /api/inventory/:id                inventory.view       Item detail
 * POST   /api/inventory                    inventory.create     Create item
 * PUT    /api/inventory/:id                inventory.edit       Update item
 * DELETE /api/inventory/:id                inventory.delete     Soft-delete item
 * POST   /api/inventory/:id/stock-in       inventory.stock_in   Record stock received
 * POST   /api/inventory/:id/stock-out      inventory.stock_out  Record stock consumed
 * GET    /api/inventory/:id/movements      inventory.view       Stock movement history
 */

const { Router } = require("express");
const inventoryController = require("../controllers/inventoryController");
const { authenticate, requirePermission } = require("../middleware/auth");
const {
  createItemSchema,
  updateItemSchema,
  stockInSchema,
  stockOutSchema,
  validate,
} = require("../middleware/validators/inventoryValidation");

const router = Router();

// All inventory routes require authentication
router.use(authenticate);

// ─── Static routes BEFORE parameterised ones ────────────────────────────────

// GET /api/inventory/low-stock — items below reorder threshold
router.get(
  "/low-stock",
  requirePermission("inventory.view"),
  inventoryController.getLowStockItems
);

// GET /api/inventory/ready-stock — ready stock items (optional ?product_id=)
router.get(
  "/ready-stock",
  requirePermission("inventory.view"),
  inventoryController.getReadyStockItems
);

// ─── Collection routes ──────────────────────────────────────────────────────

// GET /api/inventory — list with filters (?category=, ?search=, ?low_stock=)
router.get(
  "/",
  requirePermission("inventory.view"),
  inventoryController.listItems
);

// POST /api/inventory — create new item
router.post(
  "/",
  requirePermission("inventory.create"),
  validate(createItemSchema),
  inventoryController.createItem
);

// ─── Individual resource routes ─────────────────────────────────────────────

// GET /api/inventory/:id — item detail
router.get(
  "/:id",
  requirePermission("inventory.view"),
  inventoryController.getItem
);

// PUT /api/inventory/:id — update item
router.put(
  "/:id",
  requirePermission("inventory.edit"),
  validate(updateItemSchema),
  inventoryController.updateItem
);

// DELETE /api/inventory/:id — soft delete
router.delete(
  "/:id",
  requirePermission("inventory.delete"),
  inventoryController.deleteItem
);

// ─── Stock transaction routes ───────────────────────────────────────────────

// POST /api/inventory/:id/stock-in — record stock received
router.post(
  "/:id/stock-in",
  requirePermission("inventory.stock_in"),
  validate(stockInSchema),
  inventoryController.recordStockIn
);

// POST /api/inventory/:id/stock-out — record stock consumed
router.post(
  "/:id/stock-out",
  requirePermission("inventory.stock_out"),
  validate(stockOutSchema),
  inventoryController.recordStockOut
);

// GET /api/inventory/:id/movements — stock movement history
router.get(
  "/:id/movements",
  requirePermission("inventory.view"),
  inventoryController.getStockMovements
);

module.exports = router;