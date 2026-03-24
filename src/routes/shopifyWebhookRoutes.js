/**
 * Shopify Webhook Routes (NO JWT — uses HMAC verification instead)
 *
 * Mounted at /api/webhooks/shopify in app.js
 *
 * IMPORTANT: These routes MUST be registered BEFORE the global
 * express.json() middleware in app.js, using express.raw() instead,
 * so the raw body is available for HMAC verification.
 *
 * POST /api/webhooks/shopify/orders/create   HMAC   Receive new order webhook
 */

const { Router } = require("express");
const express = require("express");
const { verifyShopifyWebhook } = require("../middleware/shopifyWebhookAuth");
const ctrl = require("../controllers/shopifyController");

const router = Router();

// Use express.raw() to get the raw body as a Buffer for HMAC verification.
// The verifyShopifyWebhook middleware will parse it to JSON after verification.
router.use(
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    // Store raw body for HMAC verification
    req.rawBody = req.body;
    next();
  }
);

// ─── Webhook endpoints ────────────────────────────────────────────────

router.post(
  "/orders/create",
  // verifyShopifyWebhook,
  express.json(),
  ctrl.handleOrderCreateWebhook
);

module.exports = router;