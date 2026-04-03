/**
 * Dispatch Routes — Phase 14
 * Mounted at /api/dispatch
 */

const express = require("express");
const router = express.Router();
const { authenticate, requirePermission } = require("../middleware/auth");
const ctrl = require("../controllers/dispatchController");

// All dispatch routes require authentication
router.use(authenticate);

// ── Queries (dispatch.view) ────────────────────────────────────────
router.get("/queue", requirePermission("dispatch.view"), ctrl.getDispatchQueue);
router.get("/dispatched", requirePermission("dispatch.view"), ctrl.getDispatched);
router.get("/completed", requirePermission("dispatch.view"), ctrl.getCompleted);
router.get("/stats", requirePermission("dispatch.view"), ctrl.getDispatchStats);

// ── Mutations (dispatch.manage) ────────────────────────────────────
router.post("/order/:orderId/dispatch", requirePermission("dispatch.manage"), ctrl.dispatchOrder);
router.post("/order/:orderId/complete", requirePermission("dispatch.manage"), ctrl.completeOrder);

module.exports = router;