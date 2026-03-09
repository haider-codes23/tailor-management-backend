/**
 * BOM Routes (standalone — not nested under /products)
 *
 * These routes handle BOM and BOM item operations that are accessed
 * by ID rather than through a product parent resource.
 *
 * === BOMs ===
 * GET    /api/boms/:bomId                products.view         Single BOM with items
 * PUT    /api/boms/:bomId                products.manage_bom   Update BOM
 * DELETE /api/boms/:bomId                products.manage_bom   Delete BOM
 *
 * === BOM Items ===
 * GET    /api/boms/:bomId/items          products.view         List BOM items
 * POST   /api/boms/:bomId/items          products.manage_bom   Add BOM item
 *
 * === BOM Items (by item ID) ===
 * PUT    /api/bom-items/:itemId          products.manage_bom   Update BOM item
 * DELETE /api/bom-items/:itemId          products.manage_bom   Delete BOM item
 */

const { Router } = require("express");
const productController = require("../controllers/productController");
const { authenticate, requirePermission } = require("../middleware/auth");
const {
  validate,
  updateBOMSchema,
  addBOMItemSchema,
  updateBOMItemSchema,
} = require("../middleware/validators/productValidation");

const router = Router();

// All routes require authentication
router.use(authenticate);

// ═══════════════════════════════════════════════════════════════════════════
// BOMs by ID
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/boms/:bomId — single BOM detail
router.get(
  "/:bomId",
  requirePermission("products.view"),
  productController.getBOM
);

// PUT /api/boms/:bomId — update BOM
router.put(
  "/:bomId",
  requirePermission("products.manage_bom"),
  validate(updateBOMSchema),
  productController.updateBOM
);

// DELETE /api/boms/:bomId — delete BOM
router.delete(
  "/:bomId",
  requirePermission("products.manage_bom"),
  productController.deleteBOM
);

// ═══════════════════════════════════════════════════════════════════════════
// BOM Items (nested under BOM)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/boms/:bomId/items — list items for a BOM
router.get(
  "/:bomId/items",
  requirePermission("products.view"),
  productController.getBOMItems
);

// POST /api/boms/:bomId/items — add item to BOM
router.post(
  "/:bomId/items",
  requirePermission("products.manage_bom"),
  validate(addBOMItemSchema),
  productController.addBOMItem
);

module.exports = router;