/**
 * Sales Approval Service — Phase 13
 *
 * Business logic for Sales approval workflow:
 *   - 3-tab dashboard (approval queue, awaiting response, awaiting payment)
 *   - Send to client, client approved, re-video, alteration, cancel, start from scratch
 *   - Payment verification → dispatch
 *
 * Matches the MSW salesApprovalHandlers.js response shapes exactly.
 */

const { Op } = require("sequelize");
const {
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  ORDER_ITEM_STATUS,
  ORDER_ITEM_STATUS_VALUES,
  SECTION_STATUS,
} = require("../constants/order");

const notify = require("./notificationTriggers");

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

module.exports = function createSalesApprovalService(db) {
  const {
    Order,
    OrderItem,
    OrderItemSection,
    OrderActivity,
    ClientApproval,
    ProductionTask,
    ProductionAssignment,
    User,
    sequelize,
  } = db;

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
        videoData: j.video_data || null,
        reVideoRequest: j.re_video_request || null,
        sectionStatuses: j.section_statuses || {},
      };
    });

    const payments = order.payments || [];
    const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);

    return {
      orderId: order.id,
      orderNumber: order.order_number,
      status: order.status,
      customerName: order.customer_name,
      customerEmail: order.customer_email,
      customerPhone: order.customer_phone,
      destination: order.destination,
      fwdDate: order.fwd_date,
      totalAmount: parseFloat(order.total_amount) || 0,
      totalPaid,
      remainingAmount: (parseFloat(order.total_amount) || 0) - totalPaid,
      paymentStatus: order.payment_status,
      payments,
      items: enrichedItems,
      itemCount: enrichedItems.length,
      clientApprovalData: order.client_approval_data || null,
      cancellationData: order.cancellation_data || null,
      sentToClientAt: order.sent_to_client_at || null,
      sentToClientBy: order.sent_to_client_by || null,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
    };
  }

  // ── 1. getApprovalQueue (Tab 1) ──────────────────────────────────

  async function getApprovalQueue() {
    const orders = await Order.findAll({
      where: { status: ORDER_STATUS.READY_FOR_CLIENT_APPROVAL },
      order: [["fwd_date", "ASC"]],
    });
    const result = [];
    for (const o of orders) result.push(await buildOrderResponse(o));
    return result;
  }

  // ── 2. getAwaitingResponse (Tab 2) ───────────────────────────────

  async function getAwaitingResponse() {
    const orders = await Order.findAll({
      where: { status: ORDER_STATUS.AWAITING_CLIENT_APPROVAL },
      order: [["sent_to_client_at", "ASC"]],
    });
    const result = [];
    for (const o of orders) result.push(await buildOrderResponse(o));
    return result;
  }

  // ── 3. getAwaitingPayment (Tab 3) ────────────────────────────────

  async function getAwaitingPayment() {
    const orders = await Order.findAll({
      where: { status: ORDER_STATUS.AWAITING_ACCOUNT_APPROVAL },
      order: [["updated_at", "ASC"]],
    });
    const result = [];
    for (const o of orders) result.push(await buildOrderResponse(o));
    return result;
  }

  // ── 4. getSalesStats ─────────────────────────────────────────────

  async function getSalesStats() {
    const [readyToSend, awaitingResponse, paymentPending] = await Promise.all([
      Order.count({ where: { status: ORDER_STATUS.READY_FOR_CLIENT_APPROVAL } }),
      Order.count({ where: { status: ORDER_STATUS.AWAITING_CLIENT_APPROVAL } }),
      Order.count({ where: { status: ORDER_STATUS.AWAITING_ACCOUNT_APPROVAL } }),
    ]);
    return { readyToSend, awaitingResponse, paymentPending };
  }

  // ── 5. getOrderDetails ───────────────────────────────────────────

  async function getOrderDetails(orderId) {
    const order = await Order.findByPk(orderId);
    if (!order) throw serviceError("Order not found", 404, "NOT_FOUND");
    return buildOrderResponse(order);
  }

  // ── 6. sendOrderToClient ─────────────────────────────────────────

  async function sendOrderToClient(orderId, sentBy) {
    return sequelize.transaction(async (t) => {
      const order = await Order.findByPk(orderId, { transaction: t });
      if (!order) throw serviceError("Order not found", 404, "NOT_FOUND");

      if (order.status !== ORDER_STATUS.READY_FOR_CLIENT_APPROVAL) {
        throw serviceError(
          `Order must be in READY_FOR_CLIENT_APPROVAL status. Current: ${order.status}`,
          400, "INVALID_STATUS"
        );
      }

      const now = new Date();
      const user = await User.findByPk(sentBy, { attributes: ["id", "name"], transaction: t });

      safeUpdateOrderStatus(order, ORDER_STATUS.AWAITING_CLIENT_APPROVAL);
      await order.update({
        status: order.status,
        sent_to_client_at: now,
        sent_to_client_by: sentBy,
        updated_at: now,
      }, { transaction: t });

      // Update all order items
      await OrderItem.update(
        { status: ORDER_ITEM_STATUS.AWAITING_CLIENT_APPROVAL, updated_at: now },
        {
          where: {
            order_id: orderId,
            status: ORDER_ITEM_STATUS.READY_FOR_CLIENT_APPROVAL,
          },
          transaction: t,
        }
      );

      await ClientApproval.create({
        order_id: orderId,
        approval_type: "SENT_TO_CLIENT",
        status: "COMPLETED",
        submitted_by: sentBy,
        submitted_by_name: user?.name || "Unknown",
        submitted_at: now,
      }, { transaction: t });

      await OrderActivity.create({
        order_id: orderId,
        action: "SENT_TO_CLIENT",
        description: "Order sent to client for approval",
        performed_by: sentBy,
      }, { transaction: t });

      return {
        orderId,
        orderNumber: order.order_number,
        status: ORDER_STATUS.AWAITING_CLIENT_APPROVAL,
        sentToClientAt: now.toISOString(),
      };
    });
  }

  // ── 7. markClientApproved ────────────────────────────────────────

  async function markClientApproved(orderId, { screenshots, notes, approvedBy }) {
    return sequelize.transaction(async (t) => {
      const order = await Order.findByPk(orderId, { transaction: t });
      if (!order) throw serviceError("Order not found", 404, "NOT_FOUND");

      if (order.status !== ORDER_STATUS.AWAITING_CLIENT_APPROVAL) {
        throw serviceError(
          `Order must be in AWAITING_CLIENT_APPROVAL status. Current: ${order.status}`,
          400, "INVALID_STATUS"
        );
      }

      if (!screenshots || screenshots.length === 0) {
        throw serviceError("At least one approval screenshot is required", 400, "SCREENSHOTS_REQUIRED");
      }

      const now = new Date();
      const user = await User.findByPk(approvedBy, { attributes: ["id", "name"], transaction: t });

      const clientApprovalData = {
        approvalScreenshots: screenshots.map((ss, i) => ({
          id: `ss-${Date.now()}-${i}`,
          name: ss.name,
          dataUrl: ss.dataUrl,
          uploadedAt: now.toISOString(),
          uploadedBy: approvedBy,
        })),
        approvedAt: now.toISOString(),
        approvedBy,
        clientNotes: notes || null,
      };

      safeUpdateOrderStatus(order, ORDER_STATUS.AWAITING_ACCOUNT_APPROVAL);
      await order.update({
        status: order.status,
        client_approval_data: clientApprovalData,
        updated_at: now,
      }, { transaction: t });

      // Update all order items → CLIENT_APPROVED
      await OrderItem.update(
        { status: ORDER_ITEM_STATUS.CLIENT_APPROVED, updated_at: now },
        {
          where: {
            order_id: orderId,
            status: ORDER_ITEM_STATUS.AWAITING_CLIENT_APPROVAL,
          },
          transaction: t,
        }
      );

      await ClientApproval.create({
        order_id: orderId,
        approval_type: "CLIENT_APPROVAL",
        status: "APPROVED",
        submitted_by: approvedBy,
        submitted_by_name: user?.name || "Unknown",
        submitted_at: now,
        client_response: "APPROVED",
        responded_at: now,
        client_notes: notes || null,
        screenshots: clientApprovalData.approvalScreenshots,
      }, { transaction: t });

      await OrderActivity.create({
        order_id: orderId,
        action: "CLIENT_APPROVED",
        description: "Client approved the order - screenshots uploaded",
        performed_by: approvedBy,
      }, { transaction: t });

      notify.clientApproved(orderId, order.order_number);

      return {
        orderId,
        orderNumber: order.order_number,
        status: ORDER_STATUS.AWAITING_ACCOUNT_APPROVAL,
        clientApprovalData,
      };
    });
  }

  // ── 8. requestReVideo ────────────────────────────────────────────

  async function requestReVideo(orderId, { orderItemId, sections, requestedBy }) {
    return sequelize.transaction(async (t) => {
      const order = await Order.findByPk(orderId, { transaction: t });
      if (!order) throw serviceError("Order not found", 404, "NOT_FOUND");

      if (order.status !== ORDER_STATUS.AWAITING_CLIENT_APPROVAL) {
        throw serviceError("Order must be in AWAITING_CLIENT_APPROVAL status", 400, "INVALID_STATUS");
      }

      const item = await OrderItem.findOne({
        where: { id: orderItemId, order_id: orderId },
        transaction: t,
      });
      if (!item) throw serviceError("Order item not found in this order", 404, "NOT_FOUND");

      if (!sections || sections.length === 0) {
        throw serviceError("At least one section must be selected", 400, "SECTIONS_REQUIRED");
      }

      const now = new Date();
      const user = await User.findByPk(requestedBy, { attributes: ["id", "name"], transaction: t });

      const notesMap = {};
      const sectionNames = [];
      sections.forEach((s) => {
        notesMap[s.name] = s.notes || "";
        sectionNames.push(s.name);
      });

      const reVideoRequest = {
        requestedBy,
        requestedByName: user?.name || "Sales User",
        requestedAt: now.toISOString(),
        sections: sectionNames,
        notes: notesMap,
      };

      await item.update({ re_video_request: reVideoRequest }, { transaction: t });

      await ClientApproval.create({
        order_id: orderId,
        order_item_id: orderItemId,
        approval_type: "RE_VIDEO_REQUEST",
        status: "PENDING",
        submitted_by: requestedBy,
        submitted_by_name: user?.name || "Unknown",
        submitted_at: now,
        metadata: { sections: sectionNames, notes: notesMap },
      }, { transaction: t });

      await OrderActivity.create({
        order_id: orderId,
        order_item_id: orderItemId,
        action: "RE_VIDEO_REQUESTED",
        description: `Re-video requested for ${item.product_name} - Sections: ${sectionNames.join(", ")}`,
        performed_by: requestedBy,
        metadata: { orderItemId, sections: sectionNames },
      }, { transaction: t });

      notify.reVideoRequested(orderId, order.order_number);

      return {
        orderId,
        orderItemId,
        orderNumber: order.order_number,
        reVideoRequest,
      };
    });
  }

  // ── 9. requestAlteration ─────────────────────────────────────────

  async function requestAlteration(orderId, { sections, requestedBy }) {
    return sequelize.transaction(async (t) => {
      const order = await Order.findByPk(orderId, { transaction: t });
      if (!order) throw serviceError("Order not found", 404, "NOT_FOUND");

      if (order.status !== ORDER_STATUS.AWAITING_CLIENT_APPROVAL) {
        throw serviceError("Order must be in AWAITING_CLIENT_APPROVAL status", 400, "INVALID_STATUS");
      }

      if (!sections || sections.length === 0) {
        throw serviceError("At least one section must be selected for alteration", 400, "SECTIONS_REQUIRED");
      }

      const now = new Date();
      const user = await User.findByPk(requestedBy, { attributes: ["id", "name"], transaction: t });
      const updatedItems = [];

      for (const { orderItemId, sectionName, notes } of sections) {
        const item = await OrderItem.findOne({
          where: { id: orderItemId, order_id: orderId },
          transaction: t,
        });
        if (!item) continue;

        const sectionKey = sectionName.toLowerCase();
        const ss = item.section_statuses || {};
        if (!ss[sectionKey]) continue;

        // Reset section → READY_FOR_PRODUCTION with alteration flag
        ss[sectionKey] = {
          ...ss[sectionKey],
          status: SECTION_STATUS.READY_FOR_PRODUCTION,
          alterationNotes: notes || "",
          alterationRequestedBy: requestedBy,
          alterationRequestedAt: now.toISOString(),
          isAlteration: true,
          updatedAt: now.toISOString(),
        };

        safeUpdateOrderItemStatus(item, ORDER_ITEM_STATUS.ALTERATION_REQUIRED);

        // Clear video data — QA must re-upload after alteration
        item.changed("section_statuses", true);
        await item.update({
          section_statuses: { ...ss },
          status: item.status,
          video_data: null,
          re_video_request: null,
          updated_at: now,
        }, { transaction: t });

        // Update section table
        await OrderItemSection.update(
          { status: SECTION_STATUS.READY_FOR_PRODUCTION, status_updated_at: now, status_updated_by: requestedBy },
          { where: { order_item_id: orderItemId, piece: { [Op.iLike]: sectionKey } }, transaction: t }
        );

        updatedItems.push({ orderItemId, sectionName: sectionKey });
      }

      // Order stays in AWAITING_CLIENT_APPROVAL but affected items go to ALTERATION_REQUIRED
      await order.update({ updated_at: now }, { transaction: t });

      await ClientApproval.create({
        order_id: orderId,
        approval_type: "ALTERATION_REQUEST",
        status: "COMPLETED",
        submitted_by: requestedBy,
        submitted_by_name: user?.name || "Unknown",
        submitted_at: now,
        alteration_sections: sections,
      }, { transaction: t });

      const sectionList = sections.map((s) => `${s.sectionName} (${s.orderItemId})`).join(", ");
      await OrderActivity.create({
        order_id: orderId,
        action: "ALTERATION_REQUESTED",
        description: `Alteration requested for sections: ${sectionList}`,
        performed_by: requestedBy,
        metadata: { sections, updatedItems },
      }, { transaction: t });

      notify.alterationRequested(orderId, order.order_number, sections);
      
      return {
        orderId,
        orderNumber: order.order_number,
        updatedItems,
      };
    });
  }

  // ── 10. cancelOrder ──────────────────────────────────────────────

  async function cancelOrder(orderId, { reason, cancelledBy }) {
    return sequelize.transaction(async (t) => {
      const order = await Order.findByPk(orderId, { transaction: t });
      if (!order) throw serviceError("Order not found", 404, "NOT_FOUND");

      const now = new Date();
      const user = await User.findByPk(cancelledBy, { attributes: ["id", "name"], transaction: t });

      const cancellationData = {
        reason: reason || "Client rejected",
        cancelledBy,
        cancelledByName: user?.name || "Unknown",
        cancelledAt: now.toISOString(),
      };

      safeUpdateOrderStatus(order, ORDER_STATUS.CANCELLED_BY_CLIENT);
      await order.update({
        status: order.status,
        cancellation_data: cancellationData,
        updated_at: now,
      }, { transaction: t });

      // Cancel all order items
      await OrderItem.update(
        { status: ORDER_ITEM_STATUS.CANCELLED_BY_CLIENT, updated_at: now },
        { where: { order_id: orderId }, transaction: t }
      );

      await ClientApproval.create({
        order_id: orderId,
        approval_type: "CANCELLATION",
        status: "COMPLETED",
        submitted_by: cancelledBy,
        submitted_by_name: user?.name || "Unknown",
        submitted_at: now,
        cancellation_reason: reason,
      }, { transaction: t });

      await OrderActivity.create({
        order_id: orderId,
        action: "CANCELLED_BY_CLIENT",
        description: `Order cancelled by client - Reason: ${reason || "No reason provided"}`,
        performed_by: cancelledBy,
      }, { transaction: t });

      return {
        orderId,
        orderNumber: order.order_number,
        status: ORDER_STATUS.CANCELLED_BY_CLIENT,
        cancellationData,
      };
    });
  }

  // ── 11. startFromScratch (CAREFUL IMPLEMENTATION) ────────────────

  async function startFromScratch(orderId, { confirmedBy, reason }) {
    return sequelize.transaction(async (t) => {
      const order = await Order.findByPk(orderId, { transaction: t });
      if (!order) throw serviceError("Order not found", 404, "NOT_FOUND");

      const now = new Date();
      const user = await User.findByPk(confirmedBy, { attributes: ["id", "name"], transaction: t });

      // ── Step 1: Collect all order item IDs ──
      const orderItems = await OrderItem.findAll({
        where: { order_id: orderId },
        transaction: t,
      });
      const orderItemIds = orderItems.map((oi) => oi.id);

      // ── Step 2: Delete production tasks for all order items ──
      if (ProductionTask) {
        await ProductionTask.destroy({
          where: { order_item_id: { [Op.in]: orderItemIds } },
          transaction: t,
        });
      }

      // ── Step 3: Delete production assignments for all order items ──
      if (ProductionAssignment) {
        await ProductionAssignment.destroy({
          where: { order_item_id: { [Op.in]: orderItemIds } },
          transaction: t,
        });
      }

      // ── Step 4: Delete QA reviews for all order items ──
      const { QaReview: QaReviewModel } = db;
      if (QaReviewModel) {
        await QaReviewModel.destroy({
          where: { order_item_id: { [Op.in]: orderItemIds } },
          transaction: t,
        });
      }

      // ── Step 5: Reset each order item completely ──
      for (const oi of orderItems) {
        const ss = oi.section_statuses || {};

        // Build clean section_statuses — PENDING_INVENTORY_CHECK for all
        const cleanStatuses = {};
        Object.keys(ss).forEach((key) => {
          const normalized = key.toLowerCase();
          if (!cleanStatuses[normalized]) {
            const oldSection = ss[key];
            cleanStatuses[normalized] = {
              name: oldSection.name || key,
              status: SECTION_STATUS.PENDING_INVENTORY_CHECK,
              updatedAt: now.toISOString(),
              // Archive QA data for reference
              archivedQaData: oldSection.qaData || null,
            };
          }
        });

        // Reset status + clear all lifecycle data
        oi.changed("section_statuses", true);
        await oi.update({
          status: ORDER_ITEM_STATUS.INVENTORY_CHECK,
          section_statuses: cleanStatuses,
          video_data: null,
          re_video_request: null,
          updated_at: now,
        }, { transaction: t });

        // Reset all order_item_sections to PENDING_INVENTORY_CHECK
        await OrderItemSection.update(
          {
            status: SECTION_STATUS.PENDING_INVENTORY_CHECK,
            status_updated_at: now,
            status_updated_by: confirmedBy,
          },
          { where: { order_item_id: oi.id }, transaction: t }
        );
      }

      // ── Step 6: Reset order-level data ──
      safeUpdateOrderStatus(order, ORDER_STATUS.INVENTORY_CHECK);
      await order.update({
        status: order.status,
        sent_to_client_at: null,
        sent_to_client_by: null,
        client_approval_data: null,
        updated_at: now,
      }, { transaction: t });

      // ── Step 7: Audit trail ──
      await ClientApproval.create({
        order_id: orderId,
        approval_type: "START_FROM_SCRATCH",
        status: "COMPLETED",
        submitted_by: confirmedBy,
        submitted_by_name: user?.name || "Unknown",
        submitted_at: now,
        client_notes: reason || null,
      }, { transaction: t });

      await OrderActivity.create({
        order_id: orderId,
        action: "START_FROM_SCRATCH",
        description: `Order reset to start from scratch${reason ? ` - Reason: ${reason}` : ""}`,
        performed_by: confirmedBy,
        metadata: {
          reason,
          deletedProductionTasks: orderItemIds.length,
          resetSections: orderItems.reduce(
            (sum, oi) => sum + Object.keys(oi.section_statuses || {}).length,
            0
          ),
        },
      }, { transaction: t });

      return {
        orderId,
        orderNumber: order.order_number,
        status: ORDER_STATUS.INVENTORY_CHECK,
      };
    });
  }

  // ── 12. approvePayments ──────────────────────────────────────────

  async function approvePayments(orderId, approvedBy) {
    const result = await sequelize.transaction(async (t) => {
      const order = await Order.findByPk(orderId, { transaction: t });
      if (!order) throw serviceError("Order not found", 404, "NOT_FOUND");

      if (order.status !== ORDER_STATUS.AWAITING_ACCOUNT_APPROVAL) {
        throw serviceError("Order must be in AWAITING_ACCOUNT_APPROVAL status", 400, "INVALID_STATUS");
      }

      const payments = order.payments || [];
      const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
      const totalAmount = parseFloat(order.total_amount) || 0;

      if (totalPaid < totalAmount) {
        throw serviceError(
          `Payment insufficient. Total: PKR ${totalAmount}, Paid: PKR ${totalPaid}, Remaining: PKR ${totalAmount - totalPaid}`,
          400, "INSUFFICIENT_PAYMENT"
        );
      }

      const now = new Date();
      const user = await User.findByPk(approvedBy, { attributes: ["id", "name"], transaction: t });

      safeUpdateOrderStatus(order, ORDER_STATUS.READY_FOR_DISPATCH);
      await order.update({ status: order.status, updated_at: now }, { transaction: t });

      // Update order items → READY_FOR_DISPATCH
      await OrderItem.update(
        { status: ORDER_ITEM_STATUS.READY_FOR_DISPATCH, updated_at: now },
        {
          where: { order_id: orderId, status: ORDER_ITEM_STATUS.CLIENT_APPROVED },
          transaction: t,
        }
      );

      await ClientApproval.create({
        order_id: orderId,
        approval_type: "PAYMENT_VERIFICATION",
        status: "APPROVED",
        submitted_by: approvedBy,
        submitted_by_name: user?.name || "Unknown",
        submitted_at: now,
        payment_verified: true,
        payment_verified_by: approvedBy,
        payment_verified_at: now,
      }, { transaction: t });

      await OrderActivity.create({
        order_id: orderId,
        action: "PAYMENTS_APPROVED",
        description: `Payments verified and approved (PKR ${totalPaid} / PKR ${totalAmount}) - Ready for dispatch`,
        performed_by: approvedBy,
      }, { transaction: t });

      notify.clientApproved(orderId, order.order_number);

      return {
        orderId,
        orderNumber: order.order_number,
        status: ORDER_STATUS.READY_FOR_DISPATCH,
        totalPaid,
        totalAmount,
      };
    });

    // ── After transaction commits, push paid status to Shopify ──
    // Fire-and-forget: a Shopify failure must NOT undo payment approval.
    // Lazy require avoids circular dependency with shopifyService.
    try {
      const shopifyService = require("./shopifyService");
      shopifyService
        .syncPaymentStatusToShopify(orderId, { id: approvedBy })
        .catch((err) => {
          console.error(
            `[approvePayments] Shopify payment sync error for order ${orderId}:`,
            err.message
          );
        });
    } catch (err) {
      console.error(
        `[approvePayments] Could not invoke Shopify payment sync for order ${orderId}:`,
        err.message
      );
    }

    return result;
  }

  return {
    getApprovalQueue,
    getAwaitingResponse,
    getAwaitingPayment,
    getSalesStats,
    getOrderDetails,
    sendOrderToClient,
    markClientApproved,
    requestReVideo,
    requestAlteration,
    cancelOrder,
    startFromScratch,
    approvePayments,
  };
};