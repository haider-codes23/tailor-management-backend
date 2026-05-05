/**
 * Shopify Routes (Authenticated)
 *
 * Mounted at /api/shopify in app.js
 *
 * GET  /api/shopify/settings                         shopify.manage  Get integration settings
 * POST /api/shopify/test-connection                  shopify.manage  Test Shopify API connection
 * POST /api/shopify/webhooks/register                shopify.manage  Register webhooks
 * POST /api/shopify/sync-products                    shopify.manage  Sync products
 * GET  /api/shopify/orders                           orders.view     List Shopify orders (proxy)
 * POST /api/shopify/orders/:shopifyOrderId/import    orders.create   Import a Shopify order
 * POST /api/shopify/orders/:orderId/sync-to-shopify  orders.edit     Push local order to Shopify
 * POST /api/shopify/orders/:orderId/sync-fulfillment orders.edit     Push fulfillment status to Shopify
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
  requirePermission("shopify.manage"),
  ctrl.getSettings
);

router.post(
  "/test-connection",
  requirePermission("shopify.manage"),
  ctrl.testConnection
);

router.post(
  "/webhooks/register",
  requirePermission("shopify.manage"),
  ctrl.registerWebhooks
);

router.post(
  "/sync-products",
  requirePermission("shopify.manage"),
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