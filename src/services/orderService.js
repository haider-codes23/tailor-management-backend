/**
 * Order Service
 *
 * Business logic for Order CRUD.
 * Mirrors the logic from frontend MSW ordersHandlers.js.
 *
 * Sections:
 *   A. List orders (with filters & pagination)
 *   B. Get order detail (with items, sections, activities)
 *   C. Create order (manual) — items + sections in one transaction
 *   D. Update order
 *   E. Cancel / soft-delete order
 *   F. Add note to order
 *   G. Get order timeline
 *   H. Payments (add / delete)
 */

const { Op } = require("sequelize");
const {
  sequelize,
  Order,
  OrderItem,
  OrderItemSection,
  OrderActivity,
  Product,
  Bom,
  BomItem,
  User,
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

function serviceError(msg, status = 400, code = "ORDER_ERROR") {
  const err = new Error(msg);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Standard includes for loading an order with its items and sections.
 */
function orderDetailIncludes() {
  return [
    {
      model: OrderItem,
      as: "items",
      include: [
        { model: OrderItemSection, as: "sections", order: [["created_at", "ASC"]] },
      ],
    },
    { model: User, as: "salesOwner", attributes: ["id", "name", "email"] },
    { model: User, as: "productionHead", attributes: ["id", "name", "email"] },
  ];
}

/**
 * Build section_statuses JSONB from the OrderItemSection rows.
 * Kept in sync for fast reads on the frontend.
 */
function buildSectionStatuses(sections) {
  const statuses = {};
  for (const s of sections) {
    statuses[s.piece.toLowerCase()] = {
      status: s.status,
      type: s.type,
      price: s.price,
      updatedAt: s.status_updated_at || s.created_at,
    };
  }
  return statuses;
}

/**
 * Compute payment-derived fields and status summary for an order.
 */
function enrichOrder(order) {
  const json = order.toJSON ? order.toJSON() : { ...order };

  // Payment computed fields
  const totalPaid = (json.payments || []).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  json.total_received = totalPaid;
  json.remaining_amount = json.total_amount - totalPaid;

  // Status summary from items
  if (json.items && json.items.length > 0) {
    const counts = {};
    json.items.forEach((i) => {
      counts[i.status] = (counts[i.status] || 0) + 1;
    });
    json.status_summary = { counts, total: json.items.length };
  }

  json.item_count = (json.items || []).length;

  return json;
}

// =========================================================================
// A. LIST ORDERS
// =========================================================================

/**
 * List orders with filters and pagination.
 * Mirrors: GET /api/orders?search=&status=&source=&urgent=&consultantId=&page=&limit=
 */
async function listOrders({
  search,
  status,
  source,
  urgent,
  consultantId,
  fulfillment_source,
  payment_status,
  page = 1,
  limit = 25,
} = {}) {
  const where = {};

  // Search: order_number, customer_name, customer_email
  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    where[Op.or] = [
      { order_number: { [Op.iLike]: s } },
      { customer_name: { [Op.iLike]: s } },
      { customer_email: { [Op.iLike]: s } },
    ];
  }

  // Status filter (comma-separated for multi-select)
  if (status) {
    const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
    if (statuses.length > 0) {
      where.status = { [Op.in]: statuses };
    }
  }

  if (source) where.source = source;

  if (urgent === "true" || urgent === true) {
    where.urgent = true;
  }

  if (consultantId) where.sales_owner_id = consultantId;

  if (fulfillment_source) where.fulfillment_source = fulfillment_source;

  if (payment_status) where.payment_status = payment_status;

  const offset = (page - 1) * limit;

  const { rows, count } = await Order.findAndCountAll({
    where,
    include: [
      {
        model: OrderItem,
        as: "items",
        attributes: ["id", "status", "product_name", "quantity", "fulfillment_source"],
      },
      { model: User, as: "salesOwner", attributes: ["id", "name"] },
    ],
    order: [["created_at", "DESC"]],
    limit,
    offset,
    distinct: true, // correct count with hasMany includes
  });

  const total = count;
  const totalPages = Math.ceil(total / limit);

  const orders = rows.map((o) => enrichOrder(o));

  return { orders, pagination: { page, limit, total, totalPages } };
}

// =========================================================================
// B. GET ORDER DETAIL
// =========================================================================

/**
 * Get a single order with all items, sections, and computed fields.
 * Mirrors: GET /api/orders/:id
 */
async function getOrderById(orderId) {
  const order = await Order.findByPk(orderId, {
    include: orderDetailIncludes(),
  });

  if (!order) {
    throw serviceError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  return enrichOrder(order);
}

// =========================================================================
// C. CREATE ORDER (Manual)
// =========================================================================

/**
 * Create a new manual order with items and sections.
 * All in one transaction.
 *
 * Mirrors: POST /api/orders from ordersHandlers.js
 *
 * @param {Object} data - Order payload from frontend
 * @param {Object} user - Authenticated user (req.user)
 * @returns {Promise<Object>} Created order with items
 */
async function createOrder(data, user) {
  if (!data.items || data.items.length === 0) {
    throw serviceError("At least one order item is required", 400, "NO_ITEMS");
  }

  const t = await sequelize.transaction();

  try {
    // 1. Generate order number
    const orderNumber = await Order.generateOrderNumber(t);

    // 2. Create the order record
    const order = await Order.create(
      {
        order_number: orderNumber,
        status: ORDER_STATUS.RECEIVED,
        source: "MANUAL",
        fulfillment_source: null, // determined later by ready stock check
        // Customer
        customer_name: data.customer_name || data.customerName,
        customer_email: data.customer_email || data.customerEmail || null,
        customer_phone: data.customer_phone || data.customerPhone || null,
        destination: data.destination || null,
        client_height: data.client_height || data.clientHeight || null,
        shipping_address: data.shipping_address || data.address || null,
        // People
        sales_owner_id: user.id,
        consultant_name: data.consultant_name || data.consultantName || user.name,
        production_in_charge: data.production_in_charge || data.productionInchargeName || null,
        production_head_id: data.production_head_id || data.productionInchargeId || null,
        // Financials
        currency: data.currency || "PKR",
        total_amount: data.total_amount || data.totalAmount || 0,
        discount: data.discount || 0,
        shipping_cost: data.shipping_cost || data.shippingCost || 0,
        tax: data.tax || 0,
        payment_status: PAYMENT_STATUS.PENDING,
        payment_method: data.payment_method || data.paymentMethod || null,
        payments: [],
        // Dates
        fwd_date: data.fwd_date || data.fwdDate || new Date().toISOString().split("T")[0],
        production_shipping_date: data.production_shipping_date || data.productionShippingDate || null,
        // Shopify (manual orders start as NOT_SYNCED)
        shopify_sync_status: SHOPIFY_SYNC_STATUS.NOT_SYNCED,
        // Misc
        urgent: data.urgent || false,
        notes: data.notes || null,
        tags: data.tags || [],
      },
      { transaction: t }
    );

    // 3. Create order items + sections
    const createdItems = [];

    for (const itemData of data.items) {
      // Validate product exists
      let product = null;
      if (itemData.product_id || itemData.productId) {
        product = await Product.findByPk(
          itemData.product_id || itemData.productId,
          { transaction: t }
        );
        if (!product) {
          throw serviceError(
            `Product not found: ${itemData.product_id || itemData.productId}`,
            404,
            "PRODUCT_NOT_FOUND"
          );
        }
      }

      // Find active BOM for the product (if exists)
      let activeBom = null;
      if (product) {
        activeBom = await Bom.findOne({
          where: { product_id: product.id, is_active: true },
          transaction: t,
        });
      }

      const sizeType = itemData.size_type || itemData.sizeType || SIZE_TYPE.STANDARD;
      const includedItems = itemData.included_items || itemData.includedItems || [];
      const selectedAddOns = itemData.selected_add_ons || itemData.selectedAddOns || [];

      const orderItem = await OrderItem.create(
        {
          order_id: order.id,
          product_id: product ? product.id : null,
          product_name: itemData.product_name || itemData.productName || (product ? product.name : "Unknown"),
          product_sku: itemData.product_sku || itemData.productSku || (product ? product.sku : null),
          product_image: itemData.product_image || itemData.productImage || (product ? product.toJSON().primary_image : null),
          quantity: itemData.quantity || 1,
          unit_price: itemData.unit_price || itemData.unitPrice || 0,
          size_type: sizeType,
          size: itemData.size || null,
          status: ORDER_ITEM_STATUS.RECEIVED,
          fulfillment_source: null,
          bom_id: activeBom ? activeBom.id : null,
          // Customisation defaults
          style: itemData.style || { type: "original", details: {}, attachments: [], image: null },
          color: itemData.color || { type: "original", details: "", attachments: [], image: null },
          fabric: itemData.fabric || { type: "original", details: "", attachments: [], image: null },
          measurement_categories: [],
          measurements: {},
          order_form_generated: false,
          order_form_approved: false,
          included_items: includedItems,
          selected_add_ons: selectedAddOns,
          section_statuses: {}, // populated below
          custom_bom: null,
          modesty: itemData.modesty || null,
          notes: itemData.notes || null,
        },
        { transaction: t }
      );

      // 4. Create OrderItemSection rows from included_items + selected_add_ons
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
        createdSections = await OrderItemSection.bulkCreate(sectionRows, { transaction: t });
      }

      // 5. Build and persist section_statuses JSONB
      const sectionStatuses = buildSectionStatuses(createdSections);
      await orderItem.update({ section_statuses: sectionStatuses }, { transaction: t });

      createdItems.push({ ...orderItem.toJSON(), sections: createdSections.map((s) => s.toJSON()) });
    }

    // 6. Log activity
    await OrderActivity.log({
      orderId: order.id,
      action: `Order ${orderNumber} created with ${createdItems.length} item(s)`,
      actionType: ACTIVITY_ACTION_TYPE.ORDER_CREATED,
      userId: user.id,
      userName: user.name,
      details: { source: "MANUAL", item_count: createdItems.length },
      transaction: t,
    });

    await t.commit();

    // 7. Re-fetch the complete order with all includes
    return getOrderById(order.id);
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// =========================================================================
// D. UPDATE ORDER
// =========================================================================

/**
 * Update an existing order's editable fields.
 * Mirrors: PUT /api/orders/:id
 */
async function updateOrder(orderId, data, user) {
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw serviceError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  // Whitelist of editable fields
  const editable = [
    "customer_name", "customer_email", "customer_phone",
    "destination", "client_height", "shipping_address",
    "consultant_name", "production_in_charge", "production_head_id",
    "currency", "total_amount", "discount", "shipping_cost", "tax",
    "payment_status", "payment_method",
    "fwd_date", "production_shipping_date",
    "urgent", "notes", "order_form_link", "tags",
    // camelCase aliases from frontend
    "customerName", "customerEmail", "customerPhone",
    "clientHeight", "consultantName", "productionInchargeName",
    "productionShippingDate", "fwdDate", "totalAmount",
    "shippingCost", "paymentMethod", "paymentStatus",
  ];

  // Map camelCase → snake_case
  const camelToSnake = {
    customerName: "customer_name",
    customerEmail: "customer_email",
    customerPhone: "customer_phone",
    clientHeight: "client_height",
    consultantName: "consultant_name",
    productionInchargeName: "production_in_charge",
    productionShippingDate: "production_shipping_date",
    fwdDate: "fwd_date",
    totalAmount: "total_amount",
    shippingCost: "shipping_cost",
    paymentMethod: "payment_method",
    paymentStatus: "payment_status",
  };

  const updates = {};
  for (const key of Object.keys(data)) {
    if (editable.includes(key)) {
      const dbKey = camelToSnake[key] || key;
      updates[dbKey] = data[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw serviceError("No editable fields provided", 400, "NO_UPDATES");
  }

  await order.update(updates);

  // Log
  await OrderActivity.log({
    orderId: order.id,
    action: "Order updated",
    actionType: ACTIVITY_ACTION_TYPE.ORDER_UPDATED,
    userId: user.id,
    userName: user.name,
    details: { updated_fields: Object.keys(updates) },
  });

  return getOrderById(order.id);
}

// =========================================================================
// E. CANCEL ORDER
// =========================================================================

/**
 * Cancel (soft-delete) an order.
 * Mirrors: DELETE /api/orders/:id
 */
async function cancelOrder(orderId, user) {
  const order = await Order.findByPk(orderId, {
    include: [{ model: OrderItem, as: "items" }],
  });

  if (!order) {
    throw serviceError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  const t = await sequelize.transaction();
  try {
    // Update order status
    await order.update({ status: ORDER_STATUS.CANCELLED }, { transaction: t });

    // Cancel all items
    for (const item of order.items) {
      await item.update({ status: ORDER_ITEM_STATUS.CANCELLED }, { transaction: t });
    }

    // Log
    await OrderActivity.log({
      orderId: order.id,
      action: "Order cancelled",
      actionType: ACTIVITY_ACTION_TYPE.STATUS_CHANGE,
      userId: user.id,
      userName: user.name,
      details: { previous_status: order.status, new_status: ORDER_STATUS.CANCELLED },
      transaction: t,
    });

    await t.commit();
    return getOrderById(order.id);
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// =========================================================================
// F. ADD NOTE
// =========================================================================

/**
 * Add an internal note to an order.
 * Mirrors: POST /api/orders/:id/notes
 */
async function addNote(orderId, { note }, user) {
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw serviceError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  await OrderActivity.log({
    orderId: order.id,
    action: note,
    actionType: ACTIVITY_ACTION_TYPE.NOTE_ADDED,
    userId: user.id,
    userName: user.name,
  });

  return { success: true };
}

// =========================================================================
// G. GET TIMELINE
// =========================================================================

/**
 * Get all activities for an order (timeline).
 * Mirrors: GET /api/orders/:id/timeline
 */
async function getTimeline(orderId) {
  const order = await Order.findByPk(orderId, { attributes: ["id"] });
  if (!order) {
    throw serviceError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  const activities = await OrderActivity.findAll({
    where: { order_id: orderId },
    include: [{ model: User, as: "performer", attributes: ["id", "name"] }],
    order: [["created_at", "DESC"]],
  });

  return activities.map((a) => a.toJSON());
}

// =========================================================================
// H. PAYMENTS
// =========================================================================

/**
 * Add a payment to an order.
 * Mirrors: POST /api/orders/:id/payments
 */
async function addPayment(orderId, paymentData, user) {
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw serviceError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  const payment = {
    id: require("crypto").randomUUID(),
    amount: parseFloat(paymentData.amount),
    method: paymentData.method || order.payment_method,
    date: paymentData.date || new Date().toISOString(),
    notes: paymentData.notes || null,
    recorded_by: user.name,
  };

  const payments = [...(order.payments || []), payment];
  const totalReceived = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const remaining = parseFloat(order.total_amount) - totalReceived;

  let paymentStatus = PAYMENT_STATUS.PENDING;
  if (totalReceived >= parseFloat(order.total_amount)) {
    paymentStatus = PAYMENT_STATUS.PAID;
  } else if (totalReceived > 0) {
    paymentStatus = PAYMENT_STATUS.PARTIAL;
  }

  await order.update({
    payments,
    total_received: totalReceived,
    remaining_amount: remaining,
    payment_status: paymentStatus,
  });

  await OrderActivity.log({
    orderId,
    action: `Payment of ${payment.amount} recorded`,
    actionType: ACTIVITY_ACTION_TYPE.PAYMENT,
    userId: user.id,
    userName: user.name,
    details: { payment_id: payment.id, amount: payment.amount, new_status: paymentStatus },
  });

  return getOrderById(orderId);
}

/**
 * Delete a payment from an order.
 * Mirrors: DELETE /api/orders/:id/payments/:paymentId
 */
async function deletePayment(orderId, paymentId, user) {
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw serviceError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  const payments = (order.payments || []).filter((p) => p.id !== paymentId);
  const totalReceived = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
  const remaining = parseFloat(order.total_amount) - totalReceived;

  let paymentStatus = PAYMENT_STATUS.PENDING;
  if (totalReceived >= parseFloat(order.total_amount)) {
    paymentStatus = PAYMENT_STATUS.PAID;
  } else if (totalReceived > 0) {
    paymentStatus = PAYMENT_STATUS.PARTIAL;
  }

  await order.update({
    payments,
    total_received: totalReceived,
    remaining_amount: remaining,
    payment_status: paymentStatus,
  });

  await OrderActivity.log({
    orderId,
    action: `Payment ${paymentId} removed`,
    actionType: ACTIVITY_ACTION_TYPE.PAYMENT,
    userId: user.id,
    userName: user.name,
    details: { payment_id: paymentId, action: "deleted" },
  });

  return getOrderById(orderId);
}

// =========================================================================
// Exports
// =========================================================================

module.exports = {
  listOrders,
  getOrderById,
  createOrder,
  updateOrder,
  cancelOrder,
  addNote,
  getTimeline,
  addPayment,
  deletePayment,
};