/**
 * Shopify Routes (Authenticated)
 *
 * Mounted at /api/shopify in app.js
 *
 * GET  /api/shopify/settings                         admin         Get integration settings
 * POST /api/shopify/test-connection                   admin         Test Shopify API connection
 * POST /api/shopify/webhooks/register                 admin         Register webhooks
 * GET  /api/shopify/orders                            orders.view   List Shopify orders (proxy)
 * POST /api/shopify/orders/:shopifyOrderId/import     orders.create Import a Shopify order
 */

const { Router } = require("express");
const { authenticate, requirePermission } = require("../middleware/auth");
const ctrl = require("../controllers/shopifyController");

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─── Admin-only endpoints ─────────────────────────────────────────────

router.get(
  "/settings",
  requirePermission("admin"),
  ctrl.getSettings
);

router.post(
  "/test-connection",
  requirePermission("admin"),
  ctrl.testConnection
);

router.post(
  "/webhooks/register",
  requirePermission("admin"),
  ctrl.registerWebhooks
);

router.post(
  "/sync-products",
  requirePermission("admin"),
  ctrl.syncProducts
);

// ─── Order endpoints ──────────────────────────────────────────────────

router.get(
  "/orders",
  requirePermission("orders.view"),
  ctrl.listOrders
);

router.post(
  "/orders/:shopifyOrderId/import",
  requirePermission("orders.create"),
  ctrl.importOrder
);

// ─── Phase 15: Outbound Sync ──────────────────────────────────────────

router.post(
  "/orders/:orderId/sync-to-shopify",
  requirePermission("orders.edit"),
  ctrl.syncToShopify
);

router.post(
  "/orders/:orderId/sync-fulfillment",
  requirePermission("orders.edit"),
  ctrl.syncFulfillment
);

module.exports = router;