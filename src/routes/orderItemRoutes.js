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
const inventoryCheckCtrl = require("../controllers/inventoryCheckController");
const packetCtrl = require("../controllers/packetController");

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

// ─── Inventory Check ──────────────────────────────────────────────────

// POST /api/order-items/:id/inventory-check — Run inventory check
router.post(
  "/:id/inventory-check",
  requirePermission("orders.edit"),
  inventoryCheckCtrl.runInventoryCheck
);

// POST /api/order-items/:id/rerun-section-inventory-check — Re-run for AWAITING_MATERIAL sections
router.post(
  "/:id/rerun-section-inventory-check",
  requirePermission("orders.edit"),
  inventoryCheckCtrl.rerunSectionInventoryCheck
);

// ─── Packet Workflow (Phase 10) ───────────────────────────────────────


// GET /api/order-items/:id/packet — Get packet for an order item
router.get(
  "/:id/packet",
  requirePermission("production.view"),
  packetCtrl.getPacket
);

// POST /api/order-items/:id/packet/assign — Assign packet
router.post(
  "/:id/packet/assign",
  requirePermission("production.manage"),
  packetCtrl.assignPacket
);

// POST /api/order-items/:id/packet/start — Start picking
router.post(
  "/:id/packet/start",
  requirePermission("production.view"),
  packetCtrl.startPacket
);

// POST /api/order-items/:id/packet/pick-item — Mark item picked
router.post(
  "/:id/packet/pick-item",
  requirePermission("production.view"),
  packetCtrl.pickItem
);

// POST /api/order-items/:id/packet/complete — Mark packet complete
router.post(
  "/:id/packet/complete",
  requirePermission("production.view"),
  packetCtrl.completePacket
);

// POST /api/order-items/:id/packet/approve — Approve packet
router.post(
  "/:id/packet/approve",
  requirePermission("production.approve_packets"),
  packetCtrl.approvePacket
);

// POST /api/order-items/:id/packet/reject — Reject packet
router.post(
  "/:id/packet/reject",
  requirePermission("production.approve_packets"),
  packetCtrl.rejectPacket
);

module.exports = router;