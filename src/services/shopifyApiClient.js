/**
 * Shopify Admin API Client
 *
 * Thin wrapper around fetch for making authenticated requests
 * to the Shopify Admin REST API.
 *
 * Usage:
 *   const client = require('./shopifyApiClient');
 *   const orders = await client.get('/orders.json?limit=10');
 *   const order  = await client.get(`/orders/${shopifyOrderId}.json`);
 */

const env = require("../config/environment");

const SHOPIFY_BASE_URL = `https://${env.shopify.storeUrl}/admin/api/${env.shopify.apiVersion}`;

/**
 * Make an authenticated request to the Shopify Admin API.
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
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": env.shopify.accessToken,
    },
  };

  if (body && (method === "POST" || method === "PUT")) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  // Handle rate limiting (429)
  if (response.status === 429) {
    const retryAfter = parseFloat(response.headers.get("Retry-After") || "2");
    console.warn(`⏳ Shopify rate limit hit, retrying in ${retryAfter}s...`);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return shopifyRequest(method, endpoint, body);
  }

  // Handle 204 No Content (e.g., DELETE)
  if (response.status === 204) {
    return { success: true };
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errMsg = data?.errors
      ? typeof data.errors === "string"
        ? data.errors
        : JSON.stringify(data.errors)
      : `Shopify API error: ${response.status} ${response.statusText}`;

    const err = new Error(errMsg);
    err.status = response.status;
    err.code = "SHOPIFY_API_ERROR";
    err.shopifyErrors = data?.errors || null;
    throw err;
  }

  return data;
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
};