/**
 * Order Routes
 *
 * All routes require authentication.
 * Middleware chain: authenticate → requirePermission → [validate] → controller
 *
 * GET    /api/orders                        orders.view    List orders (with filters)
 * GET    /api/orders/:id                    orders.view    Order detail (with items/sections)
 * POST   /api/orders                        orders.create  Create order (manual)
 * PUT    /api/orders/:id                    orders.edit    Update order
 * DELETE /api/orders/:id                    orders.delete  Cancel order
 * POST   /api/orders/:id/notes              orders.edit    Add internal note
 * GET    /api/orders/:id/timeline           orders.view    Order timeline / activity log
 * POST   /api/orders/:id/payments           orders.edit    Add payment
 * DELETE /api/orders/:id/payments/:paymentId orders.edit   Delete payment
 */

const { Router } = require("express");
const orderController = require("../controllers/orderController");
const { authenticate, requirePermission } = require("../middleware/auth");
const {
  createOrderSchema,
  updateOrderSchema,
  addNoteSchema,
  addPaymentSchema,
  validate,
} = require("../middleware/validators/orderValidation");

const router = Router();

// All order routes require authentication
router.use(authenticate);

// ─── Collection routes ──────────────────────────────────────────────────────

// GET /api/orders — list with filters & pagination
router.get(
  "/",
  requirePermission("orders.view"),
  orderController.listOrders
);

// POST /api/orders — create new order
router.post(
  "/",
  requirePermission("orders.create"),
  validate(createOrderSchema),
  orderController.createOrder
);

// ─── Individual resource routes ─────────────────────────────────────────────

// GET /api/orders/:id — order detail
router.get(
  "/:id",
  requirePermission("orders.view"),
  orderController.getOrder
);

// PUT /api/orders/:id — update order
router.put(
  "/:id",
  requirePermission("orders.edit"),
  validate(updateOrderSchema),
  orderController.updateOrder
);

// DELETE /api/orders/:id — cancel order
router.delete(
  "/:id",
  requirePermission("orders.delete"),
  orderController.cancelOrder
);

// ─── Sub-resource routes ────────────────────────────────────────────────────

// POST /api/orders/:id/notes — add internal note
router.post(
  "/:id/notes",
  requirePermission("orders.edit"),
  validate(addNoteSchema),
  orderController.addNote
);

// GET /api/orders/:id/timeline — activity log
router.get(
  "/:id/timeline",
  requirePermission("orders.view"),
  orderController.getTimeline
);

// POST /api/orders/:id/payments — add payment
const { receiptUpload } = require("../config/multer");

router.post(
  "/:id/payments",
  requirePermission("orders.edit"),
  receiptUpload.single("receiptFile"),
  validate(addPaymentSchema),
  orderController.addPayment
);

// DELETE /api/orders/:id/payments/:paymentId — delete payment
router.delete(
  "/:id/payments/:paymentId",
  requirePermission("orders.edit"),
  orderController.deletePayment
);

// ─── Ready Stock routes ─────────────────────────────────────────────────────

// GET /api/orders/:id/ready-stock-issues — inventory movements for RS orders
router.get(
  "/:id/ready-stock-issues",
  requirePermission("orders.view"),
  orderController.getReadyStockIssues
);

// POST /api/orders/:id/check-ready-stock — manual ready stock recheck
router.post(
  "/:id/check-ready-stock",
  requirePermission("orders.edit"),
  orderController.checkReadyStock
);


const orderItemController = require("../controllers/orderItemController");
const { addOrderItemSchema, validate: validateItem } = require("../middleware/validators/orderItemValidation");

/**
 * ADD this route AFTER the existing order routes (e.g. after the check-ready-stock route):
 *
 * POST /api/orders/:orderId/items — Add item to existing order
 */
router.post(
  "/:orderId/items",
  requirePermission("orders.edit"),
  validateItem(addOrderItemSchema),
  orderItemController.addOrderItem
);

module.exports = router;