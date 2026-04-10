/**
 * Dispatch Service — Phase 14
 *
 * Business logic for dispatch workflow:
 *   READY_FOR_DISPATCH → DISPATCHED → COMPLETED
 *
 * Matches the MSW dispatchHandlers.js response shapes exactly.
 */

const { Op } = require("sequelize");
const {
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  ORDER_ITEM_STATUS,
  ORDER_ITEM_STATUS_VALUES,
} = require("../constants/order");

const notify = require("./notificationTriggers");

const shopify = require("./shopifyApiClient");

function serviceError(msg, status, code) {
  const err = new Error(msg);
  err.statusCode = status;
  err.code = code;
  return err;
}

function safeUpdateOrderStatus(order, newStatus) {
  if (ORDER_STATUS_VALUES.includes(newStatus)) order.status = newStatus;
}

function safeUpdateOrderItemStatus(item, newStatus) {
  if (ORDER_ITEM_STATUS_VALUES.includes(newStatus)) item.status = newStatus;
}

/**
 * Build a tracking URL based on courier name.
 * Shopify uses this to make the tracking number clickable for customers.
 */
function buildTrackingUrl(courier, trackingNumber) {
  if (!courier || !trackingNumber) return null;
  const c = courier.toLowerCase();
  if (c.includes("tcs")) {
    return `https://www.tcsexpress.com/track/${trackingNumber}`;
  }
  if (c.includes("leopard")) {
    return `https://www.leopardscourier.com/tracking?id=${trackingNumber}`;
  }
  if (c.includes("mp") || c.includes("m&p")) {
    return `https://mulphilog.com/tracking/${trackingNumber}`;
  }
  if (c.includes("dhl")) {
    return `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`;
  }
  if (c.includes("fedex")) {
    return `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`;
  }
  return null;
}

module.exports = function createDispatchService(db) {
  const { Order, OrderItem, OrderActivity, User, sequelize } = db;

  // ── Helper: build enriched order response ────────────────────────

  async function buildOrderResponse(order) {
    const items = await OrderItem.findAll({
      where: { order_id: order.id },
      order: [["created_at", "ASC"]],
    });

    const enrichedItems = items.map((oi) => {
      const j = oi.toJSON();
      return {
        id: j.id,
        productName: j.product_name,
        productSku: j.product_sku,
        productImage: j.product_image,
        size: j.size,
        quantity: j.quantity,
        unitPrice: parseFloat(j.unit_price) || 0,
        status: j.status,
      };
    });

    const payments = order.payments || [];
    const totalPaid = payments.reduce(
      (sum, p) => sum + (parseFloat(p.amount) || 0),
      0
    );

    // Build dispatchData from individual columns + JSONB
    const dd = order.dispatch_data || {};
    const dispatchData =
      order.dispatched_at || dd.dispatchedAt
        ? {
            courier: order.dispatch_courier || dd.courier || null,
            trackingNumber: order.dispatch_tracking || dd.trackingNumber || null,
            dispatchDate:
              order.actual_shipping_date ||
              dd.dispatchDate ||
              null,
            notes: dd.notes || null,
            dispatchedBy: dd.dispatchedBy || null,
            dispatchedByName: dd.dispatchedByName || null,
            dispatchedAt:
              order.dispatched_at?.toISOString?.() ||
              dd.dispatchedAt ||
              null,
          }
        : null;

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      status: order.status,
      source: order.source,
      customerName: order.customer_name,
      customerEmail: order.customer_email,
      customerPhone: order.customer_phone,
      destination: order.destination,
      shippingAddress: order.shipping_address || null,
      fwdDate: order.fwd_date,
      totalAmount: parseFloat(order.total_amount) || 0,
      currency: order.currency || "PKR",
      totalPaid,
      remainingAmount: (parseFloat(order.total_amount) || 0) - totalPaid,
      paymentStatus: order.payment_status,
      items: enrichedItems,
      itemCount: enrichedItems.length,
      urgent: order.urgent,
      dispatchData,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    };
  }

  // ── 1. getDispatchQueue (Tab 1) ──────────────────────────────────

  async function getDispatchQueue() {
    const orders = await Order.findAll({
      where: { status: ORDER_STATUS.READY_FOR_DISPATCH },
      order: [
        ["urgent", "DESC"],
        ["fwd_date", "ASC"],
      ],
    });
    const result = [];
    for (const o of orders) result.push(await buildOrderResponse(o));
    return result;
  }

  // ── 2. getDispatched (Tab 2) ─────────────────────────────────────

  async function getDispatched() {
    const orders = await Order.findAll({
      where: { status: ORDER_STATUS.DISPATCHED },
      order: [["dispatched_at", "DESC"]],
    });
    const result = [];
    for (const o of orders) result.push(await buildOrderResponse(o));
    return result;
  }

  // ── 3. getCompleted (Tab 3) ──────────────────────────────────────

  async function getCompleted() {
    const orders = await Order.findAll({
      where: { status: ORDER_STATUS.COMPLETED },
      order: [["updated_at", "DESC"]],
    });
    const result = [];
    for (const o of orders) result.push(await buildOrderResponse(o));
    return result;
  }

  // ── 4. getDispatchStats ──────────────────────────────────────────

  async function getDispatchStats() {
    const [readyForDispatch, totalDispatched, totalCompleted] =
      await Promise.all([
        Order.count({
          where: { status: ORDER_STATUS.READY_FOR_DISPATCH },
        }),
        Order.count({ where: { status: ORDER_STATUS.DISPATCHED } }),
        Order.count({ where: { status: ORDER_STATUS.COMPLETED } }),
      ]);
    return { readyForDispatch, totalDispatched, totalCompleted };
  }

  // ── 5. dispatchOrder ─────────────────────────────────────────────

  async function dispatchOrder(
    orderId,
    { courier, trackingNumber, dispatchDate, notes, dispatchedBy }
  ) {
    return sequelize.transaction(async (t) => {
      const order = await Order.findByPk(orderId, { transaction: t });
      if (!order) throw serviceError("Order not found", 404, "NOT_FOUND");

      if (order.status !== ORDER_STATUS.READY_FOR_DISPATCH) {
        throw serviceError(
          `Order must be in READY_FOR_DISPATCH status. Current: ${order.status}`,
          400,
          "INVALID_STATUS"
        );
      }

      if (!courier || !trackingNumber || !dispatchDate) {
        throw serviceError(
          "Courier, tracking number, and dispatch date are required",
          400,
          "MISSING_FIELDS"
        );
      }

      const now = new Date();
      const user = await User.findByPk(dispatchedBy, {
        attributes: ["id", "name"],
        transaction: t,
      });

      const dispatchData = {
        courier,
        trackingNumber,
        dispatchDate,
        notes: notes || "",
        dispatchedBy,
        dispatchedByName: user?.name || "Dispatch User",
        dispatchedAt: now.toISOString(),
      };

      safeUpdateOrderStatus(order, ORDER_STATUS.DISPATCHED);
      await order.update(
        {
          status: order.status,
          dispatched_at: now,
          dispatch_courier: courier,
          dispatch_tracking: trackingNumber,
          pre_tracking_id: trackingNumber,
          actual_shipping_date: dispatchDate,
          dispatch_data: dispatchData,
          updated_at: now,
        },
        { transaction: t }
      );

      // Update all order items → DISPATCHED
      await OrderItem.update(
        { status: ORDER_ITEM_STATUS.DISPATCHED, updated_at: now },
        {
          where: {
            order_id: orderId,
            status: ORDER_ITEM_STATUS.READY_FOR_DISPATCH,
          },
          transaction: t,
        }
      );

      await OrderActivity.create(
        {
          order_id: orderId,
          action: "ORDER_DISPATCHED",
          description: `Order dispatched via ${courier} — Tracking: ${trackingNumber}`,
          performed_by: dispatchedBy,
          metadata: dispatchData,
        },
        { transaction: t }
      );

      notify.orderDispatched(order, courier, trackingNumber);

      // ── Push fulfillment to Shopify if this order is synced ──
      // Fire-and-forget AFTER the transaction commits — Shopify failures
      // should NEVER break the internal dispatch flow.
      if (order.shopify_order_id) {
        setImmediate(async () => {
          try {
            console.log(
              `📦 Pushing fulfillment to Shopify for order ${order.order_number} (Shopify ID: ${order.shopify_order_id})`
            );

            const trackingUrl = buildTrackingUrl(courier, trackingNumber);
            const result = await shopify.createFulfillment(
              order.shopify_order_id,
              {
                company: courier,
                number: trackingNumber,
                url: trackingUrl,
              }
            );

            if (result.alreadyFulfilled) {
              console.log(
                `ℹ️ Shopify order ${order.shopify_order_id} was already fulfilled`
              );
            } else {
              console.log(
                `✅ Shopify fulfillment created for order ${order.order_number}`
              );

              await OrderActivity.create({
                order_id: orderId,
                action: "SHOPIFY_FULFILLMENT_CREATED",
                description: `Shopify fulfillment pushed — ${courier} ${trackingNumber}`,
                performed_by: dispatchedBy,
                metadata: {
                  shopifyOrderId: order.shopify_order_id,
                  fulfillmentId: result.fulfillment?.id,
                },
              });

              // Update the shopify_last_synced_at timestamp
              await Order.update(
                {
                  shopify_last_synced_at: new Date(),
                  shopify_sync_status: "SYNCED",
                },
                { where: { id: orderId } }
              );
            }
          } catch (err) {
            console.error(
              `❌ Failed to push Shopify fulfillment for ${order.order_number}:`,
              err.message
            );

            try {
              await OrderActivity.create({
                order_id: orderId,
                action: "SHOPIFY_FULFILLMENT_FAILED",
                description: `Failed to push fulfillment to Shopify: ${err.message}`,
                performed_by: dispatchedBy,
                metadata: {
                  error: err.message,
                  shopifyErrors: err.shopifyErrors,
                },
              });

              await Order.update(
                { shopify_sync_status: "SYNC_FAILED" },
                { where: { id: orderId } }
              );
            } catch (logErr) {
              console.error("Failed to log Shopify failure:", logErr.message);
            }
          }
        });
      } else {
        console.log(
          `ℹ️ Order ${order.order_number} not synced to Shopify — skipping fulfillment push`
        );
      }

      return buildOrderResponse(
        await Order.findByPk(orderId, { transaction: t })
      );
    });
  }

  // ── 6. completeOrder ─────────────────────────────────────────────

  async function completeOrder(orderId, completedBy) {
    return sequelize.transaction(async (t) => {
      const order = await Order.findByPk(orderId, { transaction: t });
      if (!order) throw serviceError("Order not found", 404, "NOT_FOUND");

      if (order.status !== ORDER_STATUS.DISPATCHED) {
        throw serviceError(
          `Order must be in DISPATCHED status. Current: ${order.status}`,
          400,
          "INVALID_STATUS"
        );
      }

      const now = new Date();
      const user = await User.findByPk(completedBy, {
        attributes: ["id", "name"],
        transaction: t,
      });

      safeUpdateOrderStatus(order, ORDER_STATUS.COMPLETED);
      await order.update(
        {
          status: order.status,
          completed_at: now,
          completed_by: completedBy,
          updated_at: now,
        },
        { transaction: t }
      );

      // Update all order items → COMPLETED
      await OrderItem.update(
        { status: ORDER_ITEM_STATUS.COMPLETED, updated_at: now },
        {
          where: {
            order_id: orderId,
            status: ORDER_ITEM_STATUS.DISPATCHED,
          },
          transaction: t,
        }
      );

      await OrderActivity.create(
        {
          order_id: orderId,
          action: "ORDER_COMPLETED",
          description: "Order marked as completed — delivery confirmed",
          performed_by: completedBy,
        },
        { transaction: t }
      );

      return buildOrderResponse(
        await Order.findByPk(orderId, { transaction: t })
      );
    });
  }

  return {
    getDispatchQueue,
    getDispatched,
    getCompleted,
    getDispatchStats,
    dispatchOrder,
    completeOrder,
  };
};