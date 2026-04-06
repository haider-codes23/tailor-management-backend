/**
 * Shopify Admin API Client
 *
 * Thin wrapper around fetch for making authenticated requests
 * to the Shopify Admin REST API.
 *
 * Uses a custom HTTPS agent with family:4 to force IPv4 connections
 * (fixes ETIMEDOUT errors on Pakistan networks where IPv6 fails).
 */

// Force IPv4 for Pakistan network compatibility
const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const https = require("https");
const env = require("../config/environment");

const SHOPIFY_BASE_URL = `https://${env.shopify.storeUrl}/admin/api/${env.shopify.apiVersion}`;

// Create a custom HTTPS agent that forces IPv4
const ipv4Agent = new https.Agent({
  family: 4,
  keepAlive: true,
  timeout: 30000,
});

/**
 * Make an authenticated request to the Shopify Admin API.
 * Uses node:https module instead of fetch to guarantee IPv4.
 *
 * @param {string} method - HTTP method
 * @param {string} endpoint - API path (e.g., '/orders.json')
 * @param {Object} [body] - Request body for POST/PUT
 * @returns {Promise<Object>} Parsed JSON response
 */
async function shopifyRequest(method, endpoint, body = null) {
  if (!env.shopify.accessToken) {
    throw Object.assign(
      new Error("SHOPIFY_ACCESS_TOKEN is not configured in .env"),
      { status: 500, code: "SHOPIFY_NOT_CONFIGURED" }
    );
  }

  const url = `${SHOPIFY_BASE_URL}${endpoint}`;
  const bodyStr = body && (method === "POST" || method === "PUT")
    ? JSON.stringify(body)
    : null;

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);

    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      agent: ipv4Agent,
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": env.shopify.accessToken,
        ...(bodyStr ? { "Content-Length": Buffer.byteLength(bodyStr) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        // Handle 429 rate limiting
        if (res.statusCode === 429) {
          const retryAfter = parseFloat(res.headers["retry-after"] || "2");
          console.warn(`⏳ Shopify rate limit hit, retrying in ${retryAfter}s...`);
          setTimeout(() => {
            shopifyRequest(method, endpoint, body).then(resolve).catch(reject);
          }, retryAfter * 1000);
          return;
        }

        // Handle 204 No Content
        if (res.statusCode === 204) {
          return resolve({ success: true });
        }

        // Parse JSON
        let parsed = null;
        try {
          parsed = JSON.parse(data);
        } catch {
          parsed = null;
        }

        // Handle errors
        if (res.statusCode >= 400) {
          const errMsg = parsed?.errors
            ? typeof parsed.errors === "string"
              ? parsed.errors
              : JSON.stringify(parsed.errors)
            : `Shopify API error: ${res.statusCode}`;

          const err = new Error(errMsg);
          err.status = res.statusCode;
          err.code = "SHOPIFY_API_ERROR";
          err.shopifyErrors = parsed?.errors || null;
          return reject(err);
        }

        resolve(parsed);
      });
    });

    req.on("error", (err) => {
      console.error(`❌ Shopify API request failed: ${err.message}`);
      reject(err);
    });

    // Set timeout
    req.setTimeout(30000, () => {
      req.destroy(new Error("Shopify API request timed out after 30s"));
    });

    // Write body if present
    if (bodyStr) {
      req.write(bodyStr);
    }

    req.end();
  });
}

module.exports = {
  get: (endpoint) => shopifyRequest("GET", endpoint),
  post: (endpoint, body) => shopifyRequest("POST", endpoint, body),
  put: (endpoint, body) => shopifyRequest("PUT", endpoint, body),
  del: (endpoint) => shopifyRequest("DELETE", endpoint),

  /**
   * Test connection by fetching shop info.
   * @returns {Promise<Object>} Shop details
   */
  async testConnection() {
    return shopifyRequest("GET", "/shop.json");
  },

  /**
   * Register a webhook with Shopify.
   * @param {string} topic - e.g., 'orders/create'
   * @param {string} address - Full callback URL
   * @returns {Promise<Object>}
   */
  async registerWebhook(topic, address) {
    return shopifyRequest("POST", "/webhooks.json", {
      webhook: {
        topic,
        address,
        format: "json",
      },
    });
  },

  /**
   * List all registered webhooks.
   * @returns {Promise<Object>}
   */
  async listWebhooks() {
    return shopifyRequest("GET", "/webhooks.json");
  },

  /**
   * Delete a webhook by ID.
   * @param {string|number} webhookId
   * @returns {Promise<Object>}
   */
  async deleteWebhook(webhookId) {
    return shopifyRequest("DELETE", `/webhooks/${webhookId}.json`);
  },

  // ─── Phase 15: Outbound Sync Methods ──────────────────────────────────

  /**
   * Create a draft order on Shopify from an internal manual order.
   * @param {Object} draftOrder - The draft order payload
   * @returns {Promise<Object>} { draft_order: { id, order_id, ... } }
   */
  async createDraftOrder(draftOrder) {
    return shopifyRequest("POST", "/draft_orders.json", {
      draft_order: draftOrder,
    });
  },

  /**
   * Complete (convert) a draft order into a real Shopify order.
   * @param {string|number} draftOrderId
   * @param {boolean} paymentPending
   * @returns {Promise<Object>}
   */
  async completeDraftOrder(draftOrderId, paymentPending = true) {
    return shopifyRequest(
      "PUT",
      `/draft_orders/${draftOrderId}/complete.json?payment_pending=${paymentPending}`
    );
  },

  /**
   * Create a fulfillment for a Shopify order.
   * Step 1: Get fulfillment orders
   * Step 2: Create fulfillment with tracking info
   *
   * @param {string|number} shopifyOrderId
   * @param {Object} trackingInfo - { company, number, url }
   * @returns {Promise<Object>}
   */
  async createFulfillment(shopifyOrderId, trackingInfo) {
    // Step 1: Get fulfillment orders for this order
    const foData = await shopifyRequest(
      "GET",
      `/orders/${shopifyOrderId}/fulfillment_orders.json`
    );

    const fulfillmentOrders = foData.fulfillment_orders || [];
    const openFOs = fulfillmentOrders.filter(
      (fo) => fo.status === "open" || fo.status === "in_progress"
    );

    if (openFOs.length === 0) {
      console.warn(
        `⚠️ No open fulfillment orders for Shopify order ${shopifyOrderId}. May already be fulfilled.`
      );
      return { fulfillment: null, alreadyFulfilled: true };
    }

    // Step 2: Build line_items_by_fulfillment_order
    const lineItemsByFO = openFOs.map((fo) => ({
      fulfillment_order_id: fo.id,
      fulfillment_order_line_items: (fo.line_items || []).map((li) => ({
        id: li.id,
        quantity: li.fulfillable_quantity,
      })),
    }));

    // Step 3: Create fulfillment
    const result = await shopifyRequest("POST", "/fulfillments.json", {
      fulfillment: {
        line_items_by_fulfillment_order: lineItemsByFO,
        tracking_info: {
          company: trackingInfo.company,
          number: trackingInfo.number,
          ...(trackingInfo.url ? { url: trackingInfo.url } : {}),
        },
        notify_customer: true,
      },
    });

    return result;
  },

  /**
   * Get a single Shopify order by ID.
   * @param {string|number} shopifyOrderId
   * @returns {Promise<Object>}
   */
  async getOrder(shopifyOrderId) {
    return shopifyRequest("GET", `/orders/${shopifyOrderId}.json`);
  },
};