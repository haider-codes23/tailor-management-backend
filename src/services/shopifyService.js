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
};