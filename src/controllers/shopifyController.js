/**
 * Shopify Controller
 *
 * HTTP handlers for Shopify integration endpoints.
 * Delegates all business logic to shopifyService.js.
 */

const shopifyService = require("../services/shopifyService");
const { serializeOrder } = require("../utils/orderSerializer");

// ─── GET /api/shopify/settings ────────────────────────────────────────

async function getSettings(req, res, next) {
  try {
    const settings = await shopifyService.getSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/shopify/test-connection ────────────────────────────────

async function testConnection(req, res, next) {
  try {
    const result = await shopifyService.testConnection();
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/shopify/webhooks/register ──────────────────────────────

async function registerWebhooks(req, res, next) {
  try {
    const { baseUrl } = req.body;

    // If baseUrl not provided, try to infer from request
    const inferredBaseUrl =
      baseUrl ||
      `${req.headers["x-forwarded-proto"] || req.protocol}://${req.headers["x-forwarded-host"] || req.get("host")}`;

    const result = await shopifyService.registerWebhooks(inferredBaseUrl);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/shopify/orders ──────────────────────────────────────────

async function listOrders(req, res, next) {
  try {
    const result = await shopifyService.listShopifyOrders(req.query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/shopify/orders/:shopifyOrderId/import ──────────────────

async function importOrder(req, res, next) {
  try {
    const { shopifyOrderId } = req.params;
    const result = await shopifyService.importShopifyOrder(
      shopifyOrderId,
      req.user
    );

    // Serialize the order for frontend consumption
    const serialized = result.order
      ? serializeOrder(result.order.toJSON ? result.order.toJSON() : result.order)
      : null;

    res.status(201).json({
      success: true,
      data: {
        order: serialized,
        readyStockResult: result.readyStockResult || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/webhooks/shopify/orders/create ─────────────────────────
// (Called from shopifyWebhookRoutes.js, no JWT auth, HMAC verified)

async function handleOrderCreateWebhook(req, res, next) {
  try {
    console.log(
      `📦 Shopify webhook received: orders/create, order #${req.body?.id || "unknown"}`
    );

    const result = await shopifyService.handleOrderWebhook(req.body);

    // Shopify expects a 200 response quickly
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    console.error("❌ Shopify webhook processing failed:", err.message);
    // Still return 200 to Shopify to prevent retries for known errors
    // Shopify will retry on 4xx/5xx responses
    if (err.code === "ALREADY_IMPORTED") {
      return res.status(200).json({ success: true, skipped: true });
    }
    // For unexpected errors, return 500 so Shopify retries
    next(err);
  }
}

module.exports = {
  getSettings,
  testConnection,
  registerWebhooks,
  listOrders,
  importOrder,
  handleOrderCreateWebhook,
};