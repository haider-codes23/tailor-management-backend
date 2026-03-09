/**
 * BOM Item Routes (by item ID)
 *
 * PUT    /api/bom-items/:itemId          products.manage_bom   Update BOM item
 * DELETE /api/bom-items/:itemId          products.manage_bom   Delete BOM item
 */

const { Router } = require("express");
const productController = require("../controllers/productController");
const { authenticate, requirePermission } = require("../middleware/auth");
const {
  validate,
  updateBOMItemSchema,
} = require("../middleware/validators/productValidation");

const router = Router();

router.use(authenticate);

// PUT /api/bom-items/:itemId — update
router.put(
  "/:itemId",
  requirePermission("products.manage_bom"),
  validate(updateBOMItemSchema),
  productController.updateBOMItem
);

// DELETE /api/bom-items/:itemId — delete
router.delete(
  "/:itemId",
  requirePermission("products.manage_bom"),
  productController.deleteBOMItem
);

module.exports = router;