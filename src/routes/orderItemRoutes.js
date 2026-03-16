/**
 * Order Item Routes
 *
 * Mounted at /api/order-items in app.js
 * Separate from /api/orders routes because the frontend calls
 * /api/order-items/:id directly (not nested under orders).
 *
 * The "add item to order" endpoint (POST /api/orders/:orderId/items)
 * is registered in orderRoutes.js since it's nested under orders.
 */

const { Router } = require("express");
const ctrl = require("../controllers/orderItemController");
const { authenticate, requirePermission } = require("../middleware/auth");
const {
  updateOrderItemSchema,
  generateFormSchema,
  approveFormSchema,
  timelineEntrySchema,
  validate,
} = require("../middleware/validators/orderItemValidation");

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─── Order Item CRUD ──────────────────────────────────────────────────

// GET /api/order-items/:id — Get order item detail
router.get(
  "/:id",
  requirePermission("orders.view"),
  ctrl.getOrderItem
);

// PUT /api/order-items/:id — Update order item
router.put(
  "/:id",
  requirePermission("orders.edit"),
  validate(updateOrderItemSchema),
  ctrl.updateOrderItem
);

// DELETE /api/order-items/:id — Delete order item
router.delete(
  "/:id",
  requirePermission("orders.delete"),
  ctrl.deleteOrderItem
);

// ─── Timeline ─────────────────────────────────────────────────────────

// POST /api/order-items/:id/timeline — Add timeline entry
router.post(
  "/:id/timeline",
  requirePermission("orders.edit"),
  validate(timelineEntrySchema),
  ctrl.addTimelineEntry
);

// ─── Customer Form ────────────────────────────────────────────────────

// POST /api/order-items/:id/generate-form — Generate customer form
router.post(
  "/:id/generate-form",
  requirePermission("orders.edit"),
  validate(generateFormSchema),
  ctrl.generateForm
);

// POST /api/order-items/:id/approve-form — Approve customer form
router.post(
  "/:id/approve-form",
  requirePermission("orders.edit"),
  validate(approveFormSchema),
  ctrl.approveForm
);

module.exports = router;