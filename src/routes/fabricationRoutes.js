/**
 * Fabrication Routes
 *
 * All routes for the Fabrication (Bespoke) module.
 * Mounted at /api/fabrication in app.js.
 */

const { Router } = require("express");
const { authenticate, requirePermission } = require("../middleware/auth");
const ctrl = require("../controllers/fabricationController");

const router = Router();

// All fabrication routes require authentication
router.use(authenticate);

// ── Read endpoints — require fabrication.view ─────────────────────────
router.get(
    "/orders",
    requirePermission("fabrication.view"),
    ctrl.getFabricationOrders
);

router.get(
    "/orders/:orderId",
    requirePermission("fabrication.view"),
    ctrl.getFabricationOrder
);

router.get(
    "/orders/:orderId/items/:itemId",
    requirePermission("fabrication.view"),
    ctrl.getFabricationItem
);

// ── Write endpoints — require fabrication.create_bom ──────────────────
router.post(
    "/items/:itemId/custom-bom",
    requirePermission("fabrication.create_bom"),
    ctrl.createCustomBOM
);

router.put(
    "/items/:itemId/custom-bom",
    requirePermission("fabrication.edit_bom"),
    ctrl.updateCustomBOM
);

router.post(
    "/items/:itemId/custom-bom/pieces/:piece/items",
    requirePermission("fabrication.create_bom"),
    ctrl.addBOMItem
);

router.put(
    "/items/:itemId/custom-bom/pieces/:piece/items/:bomItemId",
    requirePermission("fabrication.edit_bom"),
    ctrl.updateBOMItem
);

router.delete(
    "/items/:itemId/custom-bom/pieces/:piece/items/:bomItemId",
    requirePermission("fabrication.edit_bom"),
    ctrl.deleteBOMItem
);

router.post(
    "/items/:itemId/custom-bom/submit",
    requirePermission("fabrication.create_bom"),
    ctrl.submitCustomBOM
);

module.exports = router;
