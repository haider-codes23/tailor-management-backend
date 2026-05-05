/**
 * Shopify Service
 *
 * Business logic for Shopify integration:
 *   - getSettings: Return current Shopify config status
 *   - testConnection: Verify API credentials work
 *   - registerWebhooks: Register order webhooks with Shopify
 *   - listShopifyOrders: Proxy list from Shopify Admin API
 *   - importShopifyOrder: Pull a Shopify order into internal system
 *   - handleOrderWebhook: Process incoming orders/create webhook
 */

const shopifyApi = require("./shopifyApiClient");
const env = require("../config/environment");
const {
  sequelize,
  Order,
  OrderItem,
  OrderItemSection,
  OrderActivity,
  ShopifySyncLog,
  Product,
  Bom,
  BomItem,
} = require("../models");

const {
  ORDER_STATUS,
  ORDER_ITEM_STATUS,
  SECTION_STATUS,
  SECTION_TYPE,
  PAYMENT_STATUS,
  ACTIVITY_ACTION_TYPE,
  SHOPIFY_SYNC_STATUS,
  SIZE_TYPE,
} = require("../constants/order");

// =========================================================================
// Helpers
// =========================================================================

function serviceError(msg, status = 400, code = "SHOPIFY_ERROR") {
  const err = new Error(msg);
  err.status = status;
  err.code = code;
  return err;
}

function capitalize(s) {
  if (!s || typeof s !== "string") return s || "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/**
 * Build section_statuses JSONB from section rows.
 */
function buildSectionStatuses(sections) {
  const statuses = {};
  for (const s of sections) {
    statuses[s.piece.toLowerCase()] = {
      status: s.status,
      type: s.type,
      price: s.price || 0,
      updatedAt: s.created_at || new Date().toISOString(),
    };
  }
  return statuses;
}

// =========================================================================
// A. GET SETTINGS
// =========================================================================

/**
 * Return the current Shopify integration settings & status.
 */
async function getSettings() {
  const configured = !!(env.shopify.storeUrl && env.shopify.accessToken);

  // Check webhook status
  let webhooksRegistered = false;
  let webhookCount = 0;
  if (configured) {
    try {
      const data = await shopifyApi.listWebhooks();
      webhookCount = (data.webhooks || []).length;
      webhooksRegistered = (data.webhooks || []).some(
        (w) => w.topic === "orders/create"
      );
    } catch {
      // If API call fails, just report as not configured
    }
  }

  // Get recent sync stats
  const recentSyncs = await ShopifySyncLog.count({
    where: {
      created_at: {
        [require("sequelize").Op.gte]: new Date(
          Date.now() - 24 * 60 * 60 * 1000
        ),
      },
    },
  });

  const failedSyncs = await ShopifySyncLog.count({
    where: {
      status: "FAILED",
      created_at: {
        [require("sequelize").Op.gte]: new Date(
          Date.now() - 24 * 60 * 60 * 1000
        ),
      },
    },
  });

  return {
    configured,
    storeUrl: env.shopify.storeUrl || null,
    apiVersion: env.shopify.apiVersion,
    webhooksRegistered,
    webhookCount,
    recentSyncs24h: recentSyncs,
    failedSyncs24h: failedSyncs,
  };
}

// =========================================================================
// B. TEST CONNECTION
// =========================================================================

/**
 * Test the Shopify API connection by fetching shop info.
 */
async function testConnection() {
  if (!env.shopify.storeUrl || !env.shopify.accessToken) {
    throw serviceError(
      "Shopify credentials not configured. Set SHOPIFY_STORE_URL and SHOPIFY_ACCESS_TOKEN in .env",
      400,
      "SHOPIFY_NOT_CONFIGURED"
    );
  }

  const data = await shopifyApi.testConnection();
  const shop = data.shop;

  return {
    connected: true,
    shop: {
      name: shop.name,
      email: shop.email,
      domain: shop.domain,
      myshopifyDomain: shop.myshopify_domain,
      planName: shop.plan_name,
      currency: shop.currency,
      timezone: shop.iana_timezone,
    },
  };
}

// =========================================================================
// C. REGISTER WEBHOOKS
// =========================================================================

/**
 * Register webhooks with Shopify for order events.
 *
 * @param {string} baseUrl - The backend's public URL (e.g., ngrok URL)
 */
async function registerWebhooks(baseUrl) {
  if (!baseUrl) {
    throw serviceError("baseUrl is required to register webhooks", 400);
  }

  // Clean up existing webhooks first to avoid duplicates
  const existing = await shopifyApi.listWebhooks();
  for (const wh of existing.webhooks || []) {
    if (wh.topic === "orders/create" || wh.topic === "orders/updated") {
      await shopifyApi.deleteWebhook(wh.id);
    }
  }

  const results = [];

  // Register orders/create webhook
  const createResult = await shopifyApi.registerWebhook(
    "orders/create",
    `${baseUrl}/api/webhooks/shopify/orders/create`
  );
  results.push({
    topic: "orders/create",
    id: createResult.webhook?.id,
    address: createResult.webhook?.address,
  });

  return {
    registered: results.length,
    webhooks: results,
  };
}

// =========================================================================
// D. LIST SHOPIFY ORDERS (Proxy)
// =========================================================================

/**
 * List orders from Shopify Admin API with filters.
 * Also checks which ones are already imported locally.
 *
 * @param {Object} params - Query parameters
 * @param {number} params.limit - Number of orders (default 50)
 * @param {string} params.status - Shopify order status filter
 * @param {string} params.financial_status - paid, pending, etc.
 * @param {string} params.fulfillment_status - fulfilled, unfulfilled, etc.
 * @param {string} params.since_id - Pagination cursor
 * @param {string} params.created_at_min - Date filter
 * @param {string} params.created_at_max - Date filter
 */
async function listShopifyOrders(params = {}) {
  const queryParts = [];
  const limit = params.limit || 50;
  queryParts.push(`limit=${limit}`);

  if (params.status) queryParts.push(`status=${params.status}`);
  if (params.financial_status)
    queryParts.push(`financial_status=${params.financial_status}`);
  if (params.fulfillment_status)
    queryParts.push(`fulfillment_status=${params.fulfillment_status}`);
  if (params.since_id) queryParts.push(`since_id=${params.since_id}`);
  if (params.created_at_min)
    queryParts.push(`created_at_min=${params.created_at_min}`);
  if (params.created_at_max)
    queryParts.push(`created_at_max=${params.created_at_max}`);

  const queryString = queryParts.join("&");
  const data = await shopifyApi.get(`/orders.json?${queryString}`);

  // Check which Shopify order IDs are already imported
  const shopifyIds = (data.orders || []).map((o) => String(o.id));
  const existingOrders = await Order.findAll({
    where: { shopify_order_id: shopifyIds },
    attributes: ["id", "order_number", "shopify_order_id", "status"],
    raw: true,
  });

  const importedMap = {};
  for (const o of existingOrders) {
    importedMap[o.shopify_order_id] = {
      internalOrderId: o.id,
      orderNumber: o.order_number,
      status: o.status,
    };
  }

  // Enrich Shopify orders with import status
  const orders = (data.orders || []).map((shopifyOrder) => {
    const imported = importedMap[String(shopifyOrder.id)] || null;
    return {
      shopifyOrderId: String(shopifyOrder.id),
      orderNumber: shopifyOrder.name, // e.g., "#1001"
      email: shopifyOrder.email,
      customerName: shopifyOrder.customer
        ? `${shopifyOrder.customer.first_name || ""} ${shopifyOrder.customer.last_name || ""}`.trim()
        : shopifyOrder.email || "Unknown",
      totalPrice: shopifyOrder.total_price,
      currency: shopifyOrder.currency,
      financialStatus: shopifyOrder.financial_status,
      fulfillmentStatus: shopifyOrder.fulfillment_status,
      lineItemCount: (shopifyOrder.line_items || []).length,
      createdAt: shopifyOrder.created_at,
      // Import status
      imported: !!imported,
      internalOrderId: imported?.internalOrderId || null,
      internalOrderNumber: imported?.orderNumber || null,
      internalStatus: imported?.status || null,
    };
  });

  return { orders, count: orders.length };
}

// =========================================================================
// E. IMPORT SHOPIFY ORDER
// =========================================================================

/**
 * Shared helper: Create an internal order from Shopify order data.
 * Used by both importShopifyOrder (fetches from API) and handleOrderWebhook (uses payload).
 *
 * @param {Object} so - Shopify order object
 * @param {Object} user - User performing the action
 * @param {Object} t - Sequelize transaction
 * @returns {Promise<Object>} { order, itemCount, rsResult }
 */
async function createOrderFromShopifyData(so, user, t) {
  // Map customer info
  const customer = so.customer || {};
  const shippingAddr = so.shipping_address || {};
  const customerName =
    `${customer.first_name || ""} ${customer.last_name || ""}`.trim() ||
    so.email ||
    "Shopify Customer";

  // Generate order number
  const orderNumber = await Order.generateOrderNumber(t);

  // Create the order
  const order = await Order.create(
    {
      order_number: orderNumber,
      status: ORDER_STATUS.RECEIVED,
      source: "SHOPIFY",
      fulfillment_source: null,
      // Customer
      customer_name: customerName,
      customer_email: so.email || customer.email || null,
      customer_phone: customer.phone || shippingAddr.phone || null,
      destination: shippingAddr.country || null,
      shipping_address: shippingAddr
        ? {
            street1: shippingAddr.address1 || "",
            street2: shippingAddr.address2 || "",
            city: shippingAddr.city || "",
            state: shippingAddr.province || "",
            postalCode: shippingAddr.zip || "",
            country: shippingAddr.country || "",
          }
        : null,
      // Shopify
      shopify_order_id: String(so.id),
      shopify_order_number: so.name || `#${so.id}`,
      shopify_sync_status: SHOPIFY_SYNC_STATUS.SYNCED,
      shopify_last_synced_at: new Date(),
      // People
      sales_owner_id: user?.id || null,
      consultant_name: user?.name || "System",
      // Financials
      currency: so.currency || "PKR",
      total_amount: parseFloat(so.total_price) || 0,
      discount: parseFloat(so.total_discounts) || 0,
      shipping_cost:
        (so.shipping_lines || []).reduce(
          (sum, sl) => sum + (parseFloat(sl.price) || 0),
          0
        ) || 0,
      tax: parseFloat(so.total_tax) || 0,
      payment_status:
        so.financial_status === "paid"
          ? PAYMENT_STATUS.PAID
          : PAYMENT_STATUS.PENDING,
      payment_method: so.gateway || null,
      payments: [],
      // Dates
      fwd_date: new Date().toISOString().split("T")[0],
      // Misc
      notes: so.note || null,
      tags: so.tags
        ? so.tags.split(",").map((tag) => tag.trim()).filter(Boolean)
        : [],
    },
    { transaction: t }
  );

// Process line items → OrderItems + Sections
    const createdItems = [];

    for (const lineItem of so.line_items || []) {
      // ── Parse the Shopify variant title ─────────────────────────────
      // Format: "{Product Name} - {size} / {dupatta_option} / {pouch_option}"
      // e.g. "Amethyst Allure - m / As Shown[+PKR28400] / None"
      const variantTitle = lineItem.variant_title || "";
      const lineTitle = lineItem.title || "Unknown Product";

      // Parse size and add-on options from variant_title
      // variant_title is just the variant part: "m / As Shown[+PKR28400] / None"
      // lineItem.name is full: "Amethyst Allure - m / As Shown[+PKR28400] / None"
      const variantParts = variantTitle.split("/").map((p) => p.trim());
      const cleanSize = variantParts[0] || "Standard"; // "m", "s", "l", etc.
      const dupattaOption = variantParts[1] || null;    // "As Shown[+PKR28400]" or "None"
      const pouchOption = variantParts[2] || null;      // "As Shown[+PKR20000]" or "None"

      // Helper: extract price from option string like "As Shown[+PKR28400]"
      function extractAddonPrice(optionStr) {
        if (!optionStr || optionStr.toLowerCase() === "none") return null;
        const priceMatch = optionStr.match(/\+PKR(\d+)/i);
        return priceMatch ? parseFloat(priceMatch[1]) : 0;
      }

      const dupattaPrice = extractAddonPrice(dupattaOption);
      const pouchPrice = extractAddonPrice(pouchOption);
      const hasDupatta = dupattaPrice !== null;
      const hasPouch = pouchPrice !== null;

      // ── Try to match to an internal product ─────────────────────────
      let product = null;
      let bom = null;
      let includedItems = [];
      let selectedAddOns = [];

      // 1. Try matching by Shopify product ID
      if (lineItem.product_id) {
        product = await Product.findOne({
          where: { shopify_product_id: String(lineItem.product_id) },
        });
      }

      // 2. If no match by Shopify ID, try matching by product name
      if (!product && lineTitle) {
        product = await Product.findOne({
          where: sequelize.where(
            sequelize.fn("LOWER", sequelize.col("name")),
            lineTitle.toLowerCase().trim()
          ),
        });
      }

      // 3. If product found, use its product_items for included pieces
      if (product) {
        const productItems = product.product_items || [];
        for (const item of productItems) {
          includedItems.push({
            piece: item.piece,
            price: parseFloat(item.price) || 0,
          });
        }

        // Determine add-ons from parsed variant string + product's add_ons
        const productAddOns = product.add_ons || [];
        for (const addon of productAddOns) {
          const addonLower = addon.piece.toLowerCase();
          if (addonLower.includes("dupatta") && hasDupatta) {
            selectedAddOns.push({
              piece: addon.piece,
              price: dupattaPrice || parseFloat(addon.price) || 0,
            });
          } else if (addonLower.includes("pouch") && hasPouch) {
            selectedAddOns.push({
              piece: addon.piece,
              price: pouchPrice || parseFloat(addon.price) || 0,
            });
          }
        }

        // Also find active BOM for bom_id reference
        bom = await Bom.findOne({
          where: { product_id: product.id, is_active: true },
        });
      }

      // 4. Fallback: no product match — use product title as single piece
      if (includedItems.length === 0 && selectedAddOns.length === 0) {
        includedItems = [
          { piece: lineTitle, price: parseFloat(lineItem.price) || 0 },
        ];

        // Still add add-ons from variant parsing even without product match
        if (hasDupatta) {
          selectedAddOns.push({ piece: "Dupatta", price: dupattaPrice || 0 });
        }
        if (hasPouch) {
          selectedAddOns.push({ piece: "Pouch", price: pouchPrice || 0 });
        }
      }

      // ── Create OrderItem ────────────────────────────────────────────
      const orderItem = await OrderItem.create(
        {
          order_id: order.id,
          product_id: product?.id || null,
          product_name: lineTitle,
          product_sku: lineItem.sku || (product?.sku) || null,
          product_image: lineItem.image?.src || (product?.images?.[0]) || null,
          quantity: lineItem.quantity || 1,
          unit_price: parseFloat(lineItem.price) || 0,
          size_type: SIZE_TYPE.STANDARD, // Shopify orders assumed standard
          size: cleanSize,
          status: ORDER_ITEM_STATUS.RECEIVED,
          fulfillment_source: null,
          bom_id: bom?.id || null,
          included_items: includedItems,
          selected_add_ons: selectedAddOns,
          style: { type: "original", details: {}, attachments: [], image: null },
          color: { type: "original", details: "", attachments: [], image: null },
          fabric: { type: "original", details: "", attachments: [], image: null },
        },
        { transaction: t }
      );

      // ── Create sections ─────────────────────────────────────────────
      const sectionRows = [];
      for (const inc of includedItems) {
        sectionRows.push({
          order_item_id: orderItem.id,
          piece: inc.piece,
          type: SECTION_TYPE.MAIN,
          price: inc.price || 0,
          status: SECTION_STATUS.PENDING_INVENTORY_CHECK,
        });
      }
      for (const addon of selectedAddOns) {
        sectionRows.push({
          order_item_id: orderItem.id,
          piece: addon.piece,
          type: SECTION_TYPE.ADD_ON,
          price: addon.price || 0,
          status: SECTION_STATUS.PENDING_INVENTORY_CHECK,
        });
      }

      let createdSections = [];
      if (sectionRows.length > 0) {
        createdSections = await OrderItemSection.bulkCreate(sectionRows, {
          transaction: t,
        });
      }

      const sectionStatuses = buildSectionStatuses(createdSections);
      await orderItem.update(
        { section_statuses: sectionStatuses },
        { transaction: t }
      );

      createdItems.push(orderItem);
    }

  // Log activity
  await OrderActivity.log({
    orderId: order.id,
    action: `Order ${orderNumber} imported from Shopify (${so.name || so.id})`,
    actionType: ACTIVITY_ACTION_TYPE.SHOPIFY_SYNC,
    userId: user?.id || null,
    userName: user?.name || "System",
    details: {
      source: "SHOPIFY",
      shopify_order_id: String(so.id),
      shopify_order_number: so.name || `#${so.id}`,
      item_count: createdItems.length,
    },
    transaction: t,
  });

  // Run ready stock check
  const readyStockService = require("./readyStockService");
  const rsResult = await readyStockService.runReadyStockCheck(order.id, {
    forceProduction: false,
    user: user || { id: null, name: "System" },
    transaction: t,
  });

  // Re-fetch full order
  const fullOrder = await Order.findByPk(order.id, {
    include: [
      {
        model: OrderItem,
        as: "items",
        include: [{ model: OrderItemSection, as: "sections" }],
      },
    ],
    transaction: t,
  });

  return {
    order: fullOrder,
    itemCount: createdItems.length,
    rsResult,
  };
}

/**
 * Import a specific Shopify order into the internal system.
 * Fetches the order from Shopify API, then creates it locally.
 *
 * @param {string} shopifyOrderId - The Shopify order ID
 * @param {Object} user - Authenticated user performing the import
 */
async function importShopifyOrder(shopifyOrderId, user) {
  // 1. Check if already imported
  const existing = await Order.findOne({
    where: { shopify_order_id: String(shopifyOrderId) },
  });
  if (existing) {
    throw serviceError(
      `Shopify order ${shopifyOrderId} is already imported as ${existing.order_number}`,
      409,
      "ALREADY_IMPORTED"
    );
  }

  // 2. Create sync log entry
  const syncLog = await ShopifySyncLog.create({
    shopify_order_id: String(shopifyOrderId),
    sync_type: "IMPORT",
    sync_direction: "SHOPIFY_TO_LOCAL",
    status: "IN_PROGRESS",
    initiated_by: user?.id || null,
  });

  const t = await sequelize.transaction();

  try {
    // 3. Fetch full order from Shopify
    const shopifyData = await shopifyApi.get(
      `/orders/${shopifyOrderId}.json`
    );
    const so = shopifyData.order;

    if (!so) {
      throw serviceError(
        `Shopify order ${shopifyOrderId} not found`,
        404,
        "SHOPIFY_ORDER_NOT_FOUND"
      );
    }

    await syncLog.update({ request_payload: so });

    // 4. Use shared helper to create the order
    const result = await createOrderFromShopifyData(so, user, t);

    await t.commit();

    // 5. Update sync log
    await syncLog.update({
      order_id: result.order.id,
      status: "SUCCESS",
      response_payload: {
        order_id: result.order.id,
        order_number: result.order.order_number,
        items_created: result.itemCount,
        ready_stock_result: result.rsResult?.result || null,
      },
      completed_at: new Date(),
    });

    return {
      order: result.order,
      syncLog: syncLog,
      readyStockResult: result.rsResult,
    };
  } catch (err) {
    await t.rollback();

    await syncLog.update({
      status: "FAILED",
      error_message: err.message,
      error_details: { stack: err.stack, code: err.code },
      completed_at: new Date(),
    });

    throw err;
  }
}

// =========================================================================
// F. HANDLE ORDER WEBHOOK
// =========================================================================

/**
 * Process an incoming orders/create webhook from Shopify.
 * Uses the webhook payload directly — does NOT re-fetch from Shopify.
 *
 * @param {Object} shopifyOrderData - Raw Shopify order payload from webhook
 */
async function handleOrderWebhook(shopifyOrderData) {
  // Guard: reject payloads with no valid order ID
  if (!shopifyOrderData.id || shopifyOrderData.id === undefined) {
    console.warn("⚠️ Webhook received with no valid order ID, ignoring payload");
    return { skipped: true, reason: "missing_order_id" };
  }

  const shopifyOrderId = String(shopifyOrderData.id);

  // Check if already imported (idempotency)
  const existing = await Order.findOne({
    where: { shopify_order_id: shopifyOrderId },
  });
  if (existing) {
    console.log(
      `ℹ️  Shopify order ${shopifyOrderId} already imported as ${existing.order_number}, skipping webhook`
    );
    return { skipped: true, reason: "already_imported", orderId: existing.id };
  }

  const systemUser = { id: null, name: "Shopify Webhook" };

  // Create sync log for webhook
  const syncLog = await ShopifySyncLog.create({
    shopify_order_id: shopifyOrderId,
    sync_type: "WEBHOOK",
    sync_direction: "SHOPIFY_TO_LOCAL",
    status: "IN_PROGRESS",
    request_payload: shopifyOrderData,
  });

  const t = await sequelize.transaction();

  try {
    // Use the webhook payload directly (no re-fetch from Shopify)
    const result = await createOrderFromShopifyData(
      shopifyOrderData,
      systemUser,
      t
    );

    await t.commit();

    await syncLog.update({
      order_id: result.order.id,
      status: "SUCCESS",
      response_payload: {
        order_id: result.order.id,
        order_number: result.order.order_number,
        items_created: result.itemCount,
      },
      completed_at: new Date(),
    });

    return result;
  } catch (err) {
    await t.rollback();

    await syncLog.update({
      status: "FAILED",
      error_message: err.message,
      error_details: { stack: err.stack, code: err.code },
      completed_at: new Date(),
    });

    throw err;
  }
}


// =========================================================================
// G. SYNC PRODUCTS FROM SHOPIFY
// =========================================================================

/**
 * Pull all products from Shopify and create/link them in the internal
 * products table. Skips products that already have a matching
 * shopify_product_id. For name collisions, updates the existing product
 * with the shopify_product_id link.
 *
 * Each imported product gets:
 *   - name, sku, description, images from Shopify
 *   - shopify_product_id + shopify_variant_id linked
 *   - product_items and add_ons left empty (configured manually later)
 *   - is_active = true
 *
 * @param {Object} user - Authenticated user performing the sync
 * @returns {Promise<Object>} Summary of created, linked, and skipped products
 */
async function syncProducts(user) {
  const created = [];
  const linked = [];
  const skipped = [];
  let page = 1;
  let hasMore = true;
  let sinceId = null;

  while (hasMore) {
    // Fetch products from Shopify (paginated, 250 max per page)
    let query = "/products.json?limit=250&status=active";
    if (sinceId) query += `&since_id=${sinceId}`;

    const data = await shopifyApi.get(query);
    const shopifyProducts = data.products || [];

    if (shopifyProducts.length === 0) {
      hasMore = false;
      break;
    }

    for (const sp of shopifyProducts) {
      const shopifyProductId = String(sp.id);

      // 1. Check if already linked by shopify_product_id
      const existingByShopifyId = await Product.findOne({
        where: { shopify_product_id: shopifyProductId },
      });
      if (existingByShopifyId) {
        skipped.push({
          shopifyProductId,
          name: sp.title,
          reason: "already_linked",
          internalId: existingByShopifyId.id,
        });
        continue;
      }

      // 2. Check if a product with the same name exists (link it)
      const existingByName = await Product.findOne({
        where: sequelize.where(
          sequelize.fn("LOWER", sequelize.col("name")),
          sp.title.toLowerCase().trim()
        ),
      });

      if (existingByName) {
        // Link existing product to Shopify
        const firstVariant = (sp.variants || [])[0];
        await existingByName.update({
          shopify_product_id: shopifyProductId,
          shopify_variant_id: firstVariant ? String(firstVariant.id) : null,
          // Also update images if the internal product has none
          ...((!existingByName.images || existingByName.images.length === 0) && sp.images?.length > 0
            ? { images: sp.images.map((img) => img.src) }
            : {}),
        });

        linked.push({
          shopifyProductId,
          name: sp.title,
          internalId: existingByName.id,
          internalSku: existingByName.sku,
        });
        continue;
      }

      // 3. Create new product
      const firstVariant = (sp.variants || [])[0];

      // Generate a unique SKU from Shopify handle or product ID
      let sku = sp.handle
        ? sp.handle.toUpperCase().replace(/-/g, "_").substring(0, 90)
        : `SHOPIFY_${shopifyProductId}`;

      // Ensure SKU uniqueness
      const skuExists = await Product.findOne({ where: { sku } });
      if (skuExists) {
        sku = `${sku}_${shopifyProductId.slice(-6)}`;
      }

      // Extract images
      const images = (sp.images || []).map((img) => img.src);

      // Extract price from first variant
      const price = firstVariant ? parseFloat(firstVariant.price) || 0 : 0;

      try {
        const newProduct = await Product.create({
          name: sp.title,
          sku: sku,
          description: sp.body_html
            ? sp.body_html.replace(/<[^>]*>/g, "").trim()
            : null,
          category: sp.product_type || null,
          images: images,
          product_items: [], // Will be configured manually
          add_ons: [],       // Will be configured manually
          subtotal: price,
          discount: 0,
          total_price: price,
          shopify_product_id: shopifyProductId,
          shopify_variant_id: firstVariant ? String(firstVariant.id) : null,
          is_active: true,
        });

        created.push({
          shopifyProductId,
          name: sp.title,
          internalId: newProduct.id,
          sku: sku,
          variantCount: (sp.variants || []).length,
          imageCount: images.length,
        });
      } catch (createErr) {
        skipped.push({
          shopifyProductId,
          name: sp.title,
          reason: `create_failed: ${createErr.message}`,
        });
      }
    }

    // Pagination: use since_id of the last product
    sinceId = shopifyProducts[shopifyProducts.length - 1].id;

    // If we got fewer than 250, we've reached the end
    if (shopifyProducts.length < 250) {
      hasMore = false;
    }

    page++;
  }

  return {
    summary: {
      created: created.length,
      linked: linked.length,
      skipped: skipped.length,
      total: created.length + linked.length + skipped.length,
    },
    created,
    linked,
    skipped,
  };
}

// =========================================================================
// H. SYNC ORDER TO SHOPIFY (Manual order → Shopify draft order)
// =========================================================================

/**
 * Push a manual internal order to Shopify as a draft order, then complete it.
 * This creates a real Shopify order linked back to the internal order.
 *
 * @param {string} orderId - Internal order UUID
 * @param {Object} user - Authenticated user performing the sync
 * @returns {Promise<Object>} { shopifyOrderId, shopifyOrderNumber, syncStatus }
 */
async function syncOrderToShopify(orderId, user) {
  const order = await Order.findByPk(orderId, {
    include: [
      {
        model: OrderItem,
        as: "items",
        include: [
          { model: Product, as: "product", attributes: ["id", "name", "sku", "shopify_product_id", "shopify_variant_id"] },
        ],
      },
    ],
  });

  if (!order) {
    throw serviceError("Order not found", 404, "NOT_FOUND");
  }

  // If already synced, throw error
  if (order.shopify_order_id) {
    throw serviceError(
      `Order ${order.order_number} is already synced to Shopify (ID: ${order.shopify_order_id})`,
      409,
      "ALREADY_SYNCED"
    );
  }

  // Create sync log
  const syncLog = await ShopifySyncLog.create({
    order_id: orderId,
    sync_type: "EXPORT",
    sync_direction: "LOCAL_TO_SHOPIFY",
    status: "IN_PROGRESS",
    initiated_by: user?.id || null,
  });

  try {
    // Build line items for the Shopify draft order.
    // Each order item expands into:
    //   1. The main line item (linked variant OR custom line with unit_price)
    //   2. One custom line item per add-on in selected_add_ons
    const lineItems = [];
    for (const item of order.items || []) {
      const product = item.product;
      const qty = item.quantity || 1;

      // ── Main line item ──
      if (product?.shopify_variant_id) {
        // Linked variant — Shopify uses the variant's own price
        lineItems.push({
          variant_id: parseInt(product.shopify_variant_id, 10),
          quantity: qty,
        });
      } else {
        // Custom line — use the order item's unit_price
        lineItems.push({
          title: product?.name || item.product_name || "Custom Item",
          quantity: qty,
          price: parseFloat(item.unit_price) || 0,
          requires_shipping: true,
        });
      }

      // ── Add-on line items ──
      // selected_add_ons is JSONB: [{ piece, price }, ...]
      const addOns = Array.isArray(item.selected_add_ons)
        ? item.selected_add_ons
        : [];
      for (const addon of addOns) {
        if (!addon || !addon.piece) continue;
        const addonPrice = parseFloat(addon.price) || 0;
        if (addonPrice <= 0) continue; // skip zero-priced add-ons

        const addonTitle = `${product?.name || item.product_name || "Item"} - ${capitalize(addon.piece)} (Add-on)`;
        lineItems.push({
          title: addonTitle,
          quantity: qty,
          price: addonPrice,
          requires_shipping: true,
        });
      }
    }

    console.log(
      `   Built ${lineItems.length} Shopify line item(s) from ${(order.items || []).length} order item(s)`
    );

    // Build customer info
    const nameParts = (order.customer_name || "Customer").split(" ");
    const firstName = nameParts[0] || "Customer";
    const lastName = nameParts.slice(1).join(" ") || "";

    // Parse shipping address — handle both JSONB object and plain string
    let parsedAddress = null;
    const rawAddr = order.shipping_address;

    if (rawAddr && typeof rawAddr === "object" && !Array.isArray(rawAddr)) {
      // JSONB object format: { line1, line2, city, state, country, postal_code }
      // or { street1, street2, city, state, postalCode, country }
      parsedAddress = {
        first_name: firstName,
        last_name: lastName,
        address1: rawAddr.line1 || rawAddr.street1 || rawAddr.address1 || "",
        address2: rawAddr.line2 || rawAddr.street2 || rawAddr.address2 || "",
        city: rawAddr.city || "",
        province: rawAddr.state || rawAddr.province || "",
        country: rawAddr.country || order.destination || "PK",
        zip: rawAddr.postal_code || rawAddr.postalCode || rawAddr.zip || "",
        phone: order.customer_phone || "",
      };
    } else if (rawAddr && typeof rawAddr === "string" && rawAddr.trim()) {
      // Plain string address — put entire string in address1
      parsedAddress = {
        first_name: firstName,
        last_name: lastName,
        address1: rawAddr.trim(),
        address2: "",
        city: "",
        province: "",
        country: order.destination || "PK",
        zip: "",
        phone: order.customer_phone || "",
      };
    }

    // Build Shopify customer object
    // Shopify requires email OR phone to create a customer association
    let shopifyCustomer = undefined;
    if (order.customer_email) {
      shopifyCustomer = {
        first_name: firstName,
        last_name: lastName,
        email: order.customer_email,
        ...(order.customer_phone ? { phone: order.customer_phone } : {}),
      };
    } else if (order.customer_phone) {
      shopifyCustomer = {
        first_name: firstName,
        last_name: lastName,
        phone: order.customer_phone,
      };
    }
    // If neither email nor phone, we skip customer — Shopify allows orders without customer

    // Build billing address (same as shipping if not separate)
    const billingAddress = parsedAddress ? { ...parsedAddress } : undefined;

    const draftOrderPayload = {
      line_items: lineItems,
      customer: shopifyCustomer,
      shipping_address: parsedAddress || undefined,
      billing_address: billingAddress,
      note: !shopifyCustomer
        ? `Synced from internal order ${order.order_number} | Customer: ${order.customer_name || "Unknown"}`
        : `Synced from internal order ${order.order_number}`,
      tags: `internal_order:${order.order_number}`,
      currency: order.currency || "PKR",
    };

    // Remove undefined keys
    Object.keys(draftOrderPayload).forEach(
      (key) => draftOrderPayload[key] === undefined && delete draftOrderPayload[key]
    );

    console.log(`🔄 Creating Shopify draft order for ${order.order_number}...`);

    // Step 1: Create draft order
    const draftResult = await shopifyApi.createDraftOrder(draftOrderPayload);
    const draftOrder = draftResult.draft_order;

    if (!draftOrder?.id) {
      throw serviceError("Failed to create Shopify draft order — no ID returned", 500);
    }

    console.log(`📝 Draft order created: ${draftOrder.id}, completing...`);

    // Step 2: Complete the draft order to convert it to a real order
    const completedResult = await shopifyApi.completeDraftOrder(draftOrder.id, true);
    const completedDraft = completedResult.draft_order;
    const shopifyOrderId = completedDraft?.order_id;

    if (!shopifyOrderId) {
      throw serviceError(
        "Draft order completed but no order_id returned. Check Shopify admin.",
        500
      );
    }

    // Step 3: Get the full order to extract the order number
    const orderData = await shopifyApi.getOrder(shopifyOrderId);
    const shopifyOrder = orderData.order;

    // Step 4: Update internal order with Shopify link
    await order.update({
      shopify_order_id: String(shopifyOrderId),
      shopify_order_number: shopifyOrder?.name || `#${shopifyOrderId}`,
      shopify_sync_status: SHOPIFY_SYNC_STATUS?.SYNCED || "SYNCED",
      shopify_last_synced_at: new Date(),
    });

    // Step 5: Log activity
    await OrderActivity.create({
      order_id: orderId,
      action: "SYNCED_TO_SHOPIFY",
      description: `Order synced to Shopify as ${shopifyOrder?.name || shopifyOrderId}`,
      performed_by: user?.id || null,
      metadata: {
        shopifyOrderId: String(shopifyOrderId),
        shopifyOrderNumber: shopifyOrder?.name,
        draftOrderId: draftOrder.id,
      },
    });

    // Step 6: Update sync log
    await syncLog.update({
      status: "SUCCESS",
      response_payload: {
        shopifyOrderId: String(shopifyOrderId),
        shopifyOrderNumber: shopifyOrder?.name,
        draftOrderId: draftOrder.id,
      },
      completed_at: new Date(),
    });

    console.log(
      `✅ Order ${order.order_number} synced to Shopify as ${shopifyOrder?.name || shopifyOrderId}`
    );

    return {
      shopifyOrderId: String(shopifyOrderId),
      shopifyOrderNumber: shopifyOrder?.name || `#${shopifyOrderId}`,
      shopifyAdminUrl: `https://${env.shopify.storeUrl}/admin/orders/${shopifyOrderId}`,
      syncStatus: "SYNCED",
      syncedAt: new Date().toISOString(),
    };
  } catch (err) {
    await syncLog.update({
      status: "FAILED",
      error_message: err.message,
      error_details: { stack: err.stack, code: err.code },
      completed_at: new Date(),
    });

    // Update order sync status to FAILED
    await order.update({
      shopify_sync_status: "FAILED",
      shopify_last_synced_at: new Date(),
    });

    throw err;
  }
}

// =========================================================================
// I. SYNC FULFILLMENT TO SHOPIFY (Dispatch → Shopify fulfillment)
// =========================================================================

/**
 * Push fulfillment/tracking info to Shopify for a dispatched order.
 * Only works if the order has a shopify_order_id.
 *
 * @param {string} orderId - Internal order UUID
 * @param {Object} user - Authenticated user
 * @returns {Promise<Object>} Fulfillment result
 */
async function syncFulfillmentToShopify(orderId, user) {
  const order = await Order.findByPk(orderId);

  if (!order) {
    throw serviceError("Order not found", 404, "NOT_FOUND");
  }

  if (!order.shopify_order_id) {
    throw serviceError(
      `Order ${order.order_number} is not linked to Shopify. Sync the order first.`,
      400,
      "NOT_SYNCED"
    );
  }

  if (order.status !== "DISPATCHED" && order.status !== "COMPLETED") {
    throw serviceError(
      `Order must be DISPATCHED or COMPLETED to sync fulfillment. Current: ${order.status}`,
      400,
      "INVALID_STATUS"
    );
  }

  // Get tracking info from order
  const dispatchData = order.dispatch_data || {};
  const courier = dispatchData.courier || order.dispatch_courier || "Unknown";
  const trackingNumber = dispatchData.trackingNumber || order.dispatch_tracking || "";

  if (!trackingNumber) {
    throw serviceError("No tracking number found on this order", 400, "NO_TRACKING");
  }

  // Create sync log
  const syncLog = await ShopifySyncLog.create({
    order_id: orderId,
    shopify_order_id: order.shopify_order_id,
    sync_type: "FULFILLMENT",
    sync_direction: "LOCAL_TO_SHOPIFY",
    status: "IN_PROGRESS",
    initiated_by: user?.id || null,
  });

  try {
    console.log(
      `📦 Syncing fulfillment for ${order.order_number} → Shopify order ${order.shopify_order_id}...`
    );

    const result = await shopifyApi.createFulfillment(
      order.shopify_order_id,
      {
        company: courier,
        number: trackingNumber,
        url: null, // No tracking URL for now
      }
    );

    if (result.alreadyFulfilled) {
      console.warn(`⚠️ Shopify order ${order.shopify_order_id} is already fulfilled`);

      await syncLog.update({
        status: "SUCCESS",
        response_payload: { alreadyFulfilled: true },
        completed_at: new Date(),
      });

      return {
        success: true,
        alreadyFulfilled: true,
        message: "Shopify order was already fulfilled",
      };
    }

    const fulfillment = result.fulfillment;

    // Update sync status
    await order.update({
      shopify_sync_status: "SYNCED",
      shopify_last_synced_at: new Date(),
    });

    // Log activity
    await OrderActivity.create({
      order_id: orderId,
      action: "FULFILLMENT_SYNCED_TO_SHOPIFY",
      description: `Fulfillment synced to Shopify — ${courier} / ${trackingNumber}`,
      performed_by: user?.id || null,
      metadata: {
        shopifyFulfillmentId: fulfillment?.id,
        courier,
        trackingNumber,
      },
    });

    await syncLog.update({
      status: "SUCCESS",
      response_payload: {
        fulfillmentId: fulfillment?.id,
        trackingCompany: courier,
        trackingNumber,
      },
      completed_at: new Date(),
    });

    console.log(
      `✅ Fulfillment synced for ${order.order_number} — ${courier} / ${trackingNumber}`
    );

    return {
      success: true,
      alreadyFulfilled: false,
      fulfillmentId: fulfillment?.id,
      courier,
      trackingNumber,
      syncedAt: new Date().toISOString(),
    };
  } catch (err) {
    await syncLog.update({
      status: "FAILED",
      error_message: err.message,
      error_details: { stack: err.stack, code: err.code },
      completed_at: new Date(),
    });

    throw err;
  }
}

// =========================================================================
// J. SYNC PAYMENT STATUS TO SHOPIFY (Sales payment approval → Shopify paid)
// =========================================================================

/**
 * Push paid status to Shopify for an order whose payment has been fully
 * verified by Sales. Silently skips orders not linked to Shopify.
 *
 * Fire-and-forget pattern: callers should wrap in try/catch and NOT fail
 * the main workflow if this errors — Shopify sync is non-critical.
 *
 * @param {string} orderId - Internal order UUID
 * @param {Object} user - Authenticated user who approved the payment
 * @returns {Promise<Object|null>} Sync result, or null if skipped
 */
async function syncPaymentStatusToShopify(orderId, user) {
  const order = await Order.findByPk(orderId);

  if (!order) {
    console.warn(`[syncPaymentStatusToShopify] Order ${orderId} not found`);
    return null;
  }

  if (!order.shopify_order_id) {
    console.log(
      `[syncPaymentStatusToShopify] Order ${order.order_number} has no shopify_order_id — skipping`
    );
    return null;
  }

  const totalAmount = parseFloat(order.total_amount) || 0;
  const currency = order.currency || "PKR";

  // Resolve user name for the activity log
  let userName = "System";
  if (user?.id) {
    try {
      const u = await User.findByPk(user.id, { attributes: ["id", "name"] });
      userName = u?.name || "System";
    } catch {
      /* non-fatal */
    }
  }

  try {
    console.log(
      `💰 Marking Shopify order ${order.shopify_order_id} as paid (${currency} ${totalAmount})`
    );

    const result = await shopifyApi.markOrderPaid(
      order.shopify_order_id,
      totalAmount,
      currency
    );

    console.log(
      `[syncPaymentStatusToShopify] Shopify response:`,
      JSON.stringify(result)
    );

    await order.update({ shopify_last_synced_at: new Date() });

    await OrderActivity.create({
      order_id: orderId,
      action: `Payment marked as paid on Shopify (${currency} ${totalAmount})`,
      action_type: "SHOPIFY_SYNC",
      user_id: user?.id || null,
      user_name: userName,
      details: {
        shopifyOrderId: order.shopify_order_id,
        amount: totalAmount,
        currency,
        transactionId: result?.transaction?.id || null,
        transactionKind: result?.transaction?.kind || null,
        transactionStatus: result?.transaction?.status || null,
      },
    });

    console.log(
      `✅ Shopify payment status synced for order ${order.order_number}`
    );

    return {
      shopifyOrderId: order.shopify_order_id,
      amount: totalAmount,
      currency,
      transactionId: result?.transaction?.id || null,
    };
  } catch (err) {
    console.error(
      `❌ Failed to sync payment status to Shopify for order ${order.order_number}:`,
      err.message
    );
    if (err.shopifyErrors) {
      console.error(`   Shopify errors:`, JSON.stringify(err.shopifyErrors));
    }

    try {
      await OrderActivity.create({
        order_id: orderId,
        action: `Failed to sync payment to Shopify: ${err.message}`,
        action_type: "SHOPIFY_SYNC",
        user_id: user?.id || null,
        user_name: userName,
        details: {
          shopifyOrderId: order.shopify_order_id,
          error: err.message,
          shopifyErrors: err.shopifyErrors || null,
        },
      });
    } catch (logErr) {
      console.error(
        `[syncPaymentStatusToShopify] Also failed to write activity log:`,
        logErr.message
      );
    }

    return null;
  }
}

// =========================================================================
// Exports
// =========================================================================

module.exports = {
  getSettings,
  testConnection,
  registerWebhooks,
  listShopifyOrders,
  importShopifyOrder,
  handleOrderWebhook,
  syncProducts,
  syncOrderToShopify,      
  syncFulfillmentToShopify,
  syncPaymentStatusToShopify,
};