/**
 * Procurement Demand Routes
 *
 * Mounted at /api/procurement-demands in app.js
 *
 * GET    /api/procurement-demands          procurement.view   List demands (filter by status, orderId, orderItemId)
 * GET    /api/procurement-demands/stats    procurement.view   Dashboard counts
 * GET    /api/procurement-demands/:id      procurement.view   Single demand detail
 * PATCH  /api/procurement-demands/:id      procurement.manage Update status/notes
 * DELETE /api/procurement-demands/:id      procurement.manage Delete demand
 */

const { Router } = require("express");
const { authenticate, requirePermission } = require("../middleware/auth");
const ctrl = require("../controllers/procurementDemandController");

const router = Router();

// All routes require authentication
router.use(authenticate);

// IMPORTANT: /stats must come BEFORE /:id to avoid Express matching "stats" as an :id param
router.get(
  "/stats",
  requirePermission("procurement.view"),
  ctrl.getStats
);

router.get(
  "/",
  requirePermission("procurement.view"),
  ctrl.listDemands
);

router.get(
  "/:id",
  requirePermission("procurement.view"),
  ctrl.getDemandById
);

router.patch(
  "/:id",
  requirePermission("procurement.manage"),
  ctrl.updateDemand
);

router.delete(
  "/:id",
  requirePermission("procurement.manage"),
  ctrl.deleteDemand
);

module.exports = router;