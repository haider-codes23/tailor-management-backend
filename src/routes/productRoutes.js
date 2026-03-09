/**
 * Product Routes
 *
 * All routes require authentication.
 * Middleware chain: authenticate → requirePermission → [validate] → controller
 *
 * === Products ===
 * GET    /api/products                                              products.view
 * GET    /api/products/:id                                          products.view
 * POST   /api/products                                              products.create
 * PUT    /api/products/:id                                          products.edit
 * DELETE /api/products/:id                                          products.delete
 *
 * === BOMs ===
 * GET    /api/products/:productId/boms                              products.view
 * GET    /api/products/:productId/boms/active                       products.view
 * POST   /api/products/:productId/boms                              products.manage_bom
 * GET    /api/boms/:bomId                                           products.view
 * PUT    /api/boms/:bomId                                           products.manage_bom
 * DELETE /api/boms/:bomId                                           products.manage_bom
 *
 * === BOM Items ===
 * GET    /api/boms/:bomId/items                                     products.view
 * POST   /api/boms/:bomId/items                                     products.manage_bom
 * PUT    /api/bom-items/:itemId                                     products.manage_bom
 * DELETE /api/bom-items/:itemId                                     products.manage_bom
 *
 * === Measurement Charts ===
 * GET    /api/products/:productId/measurement-charts                products.view
 * PUT    /api/products/:productId/measurement-charts/size-chart     measurements.edit
 * PUT    /api/products/:productId/measurement-charts/height-chart   measurements.edit
 * POST   /api/products/:productId/measurement-charts/initialize     measurements.edit
 * DELETE /api/products/:productId/measurement-charts/size-chart     measurements.edit
 * DELETE /api/products/:productId/measurement-charts/height-chart   measurements.edit
 *
 * === Ready Stock ===
 * GET    /api/products/:productId/ready-stock                       products.view
 */

const { Router } = require("express");
const productController = require("../controllers/productController");
const { authenticate, requirePermission } = require("../middleware/auth");
const {
  validate,
  createProductSchema,
  updateProductSchema,
  createBOMSchema,
  updateBOMSchema,
  addBOMItemSchema,
  updateBOMItemSchema,
  updateSizeChartSchema,
  updateHeightChartSchema,
  initializeChartsSchema,
} = require("../middleware/validators/productValidation");

const router = Router();

// All product routes require authentication
router.use(authenticate);

// ═══════════════════════════════════════════════════════════════════════════
// PRODUCT CRUD
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/products — list with filters
router.get(
  "/",
  requirePermission("products.view"),
  productController.listProducts
);

// POST /api/products — create
router.post(
  "/",
  requirePermission("products.create"),
  validate(createProductSchema),
  productController.createProduct
);

// GET /api/products/:id — detail
router.get(
  "/:id",
  requirePermission("products.view"),
  productController.getProduct
);

// PUT /api/products/:id — update
router.put(
  "/:id",
  requirePermission("products.edit"),
  validate(updateProductSchema),
  productController.updateProduct
);

// DELETE /api/products/:id — soft delete
router.delete(
  "/:id",
  requirePermission("products.delete"),
  productController.deleteProduct
);

// ═══════════════════════════════════════════════════════════════════════════
// BOMs (nested under products)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/products/:productId/boms — all BOMs (optional ?size=)
router.get(
  "/:productId/boms",
  requirePermission("products.view"),
  productController.getProductBOMs
);

// GET /api/products/:productId/boms/active — active BOM(s) (optional ?size=)
router.get(
  "/:productId/boms/active",
  requirePermission("products.view"),
  productController.getActiveBOM
);

// POST /api/products/:productId/boms — create new BOM
router.post(
  "/:productId/boms",
  requirePermission("products.manage_bom"),
  validate(createBOMSchema),
  productController.createBOM
);

// ═══════════════════════════════════════════════════════════════════════════
// MEASUREMENT CHARTS (nested under products)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/products/:productId/measurement-charts
router.get(
  "/:productId/measurement-charts",
  requirePermission("products.view"),
  productController.getMeasurementCharts
);

// PUT /api/products/:productId/measurement-charts/size-chart
router.put(
  "/:productId/measurement-charts/size-chart",
  requirePermission("measurements.edit"),
  validate(updateSizeChartSchema),
  productController.updateSizeChart
);

// PUT /api/products/:productId/measurement-charts/height-chart
router.put(
  "/:productId/measurement-charts/height-chart",
  requirePermission("measurements.edit"),
  validate(updateHeightChartSchema),
  productController.updateHeightChart
);

// POST /api/products/:productId/measurement-charts/initialize
router.post(
  "/:productId/measurement-charts/initialize",
  requirePermission("measurements.edit"),
  validate(initializeChartsSchema),
  productController.initializeMeasurementCharts
);

// DELETE /api/products/:productId/measurement-charts/size-chart
router.delete(
  "/:productId/measurement-charts/size-chart",
  requirePermission("measurements.edit"),
  productController.deleteSizeChart
);

// DELETE /api/products/:productId/measurement-charts/height-chart
router.delete(
  "/:productId/measurement-charts/height-chart",
  requirePermission("measurements.edit"),
  productController.deleteHeightChart
);

// ═══════════════════════════════════════════════════════════════════════════
// READY STOCK (nested under products)
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/products/:productId/ready-stock
router.get(
  "/:productId/ready-stock",
  requirePermission("products.view"),
  productController.getReadyStock
);

module.exports = router;