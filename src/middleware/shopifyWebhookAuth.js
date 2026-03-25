/**
 * Shopify Webhook HMAC Verification Middleware
 *
 * Verifies that incoming webhook requests are genuinely from Shopify
 * by checking the X-Shopify-Hmac-SHA256 header against the raw body.
 *
 * IMPORTANT: This middleware requires access to the raw request body.
 * Express's json() parser consumes the body, so we need to capture
 * the raw body BEFORE json parsing for webhook routes.
 *
 * In app.js, webhook routes must be registered BEFORE the global
 * express.json() middleware, or use express.raw() for those routes.
 */

const crypto = require("crypto");
const env = require("../config/environment");

/**
 * Verify the HMAC signature on a Shopify webhook request.
 *
 * Expects req.rawBody to be a Buffer containing the raw request body.
 * If using express.raw(), req.body will be the Buffer directly.
 */
function verifyShopifyWebhook(req, res, next) {
  const hmacHeader = req.get("X-Shopify-Hmac-SHA256");

  if (!hmacHeader) {
    console.error("❌ Shopify webhook: Missing HMAC header");
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Missing X-Shopify-Hmac-SHA256 header",
    });
  }

  // The raw body should be available as req.body (Buffer) when using express.raw()
  const rawBody = req.rawBody || req.body;

  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    console.error("❌ Shopify webhook: Raw body not available as Buffer");
    return res.status(400).json({
      error: "BAD_REQUEST",
      message: "Raw body not available for HMAC verification",
    });
  }

  const secret = env.shopify.apiSecret;
  if (!secret) {
    console.error("❌ Shopify webhook: SHOPIFY_API_SECRET not configured");
    return res.status(500).json({
      error: "SERVER_ERROR",
      message: "Webhook verification not configured",
    });
  }

  const generatedHmac = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64");

  // Timing-safe comparison
  let isValid = false;
  try {
    isValid = crypto.timingSafeEqual(
      Buffer.from(hmacHeader, "base64"),
      Buffer.from(generatedHmac, "base64")
    );
  } catch {
    isValid = false;
  }

  if (!isValid) {
    console.error("❌ Shopify webhook: HMAC verification failed");
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "HMAC verification failed",
    });
  }

  // Parse the raw body into JSON and attach to req
  try {
    req.body = JSON.parse(rawBody.toString("utf-8"));
  } catch (parseErr) {
    console.error("❌ Shopify webhook: Failed to parse body as JSON");
    return res.status(400).json({
      error: "BAD_REQUEST",
      message: "Invalid JSON in webhook body",
    });
  }

  // Attach Shopify-specific headers for downstream use
  req.shopifyTopic = req.get("X-Shopify-Topic");
  req.shopifyShopDomain = req.get("X-Shopify-Shop-Domain");
  req.shopifyWebhookId = req.get("X-Shopify-Webhook-Id");

  next();
}

module.exports = { verifyShopifyWebhook };