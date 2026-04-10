/**
 * QA Service — Phase 13
 *
 * Business logic for QA section review, video upload, and send-to-sales.
 * Matches the MSW qaHandlers.js response shapes exactly.
 */

const { Op } = require("sequelize");
const {
  SECTION_STATUS,
  ORDER_ITEM_STATUS,
  ORDER_STATUS,
  ORDER_ITEM_STATUS_VALUES,
  ORDER_STATUS_VALUES,
} = require("../constants/order");

const notify = require("./notificationTriggers");

function serviceError(msg, status, code) {
  const err = new Error(msg);
  err.statusCode = status;
  err.code = code;
  return err;
}

function safeUpdateOrderStatus(order, newStatus) {
  if (ORDER_STATUS_VALUES.includes(newStatus)) {
    order.status = newStatus;
  }
}

function safeUpdateOrderItemStatus(item, newStatus) {
  if (ORDER_ITEM_STATUS_VALUES.includes(newStatus)) {
    item.status = newStatus;
  }
}

module.exports = function createQaService(db) {
  const {
    Order,
    OrderItem,
    OrderItemSection,
    OrderActivity,
    QaReview,
    User,
    sequelize,
  } = db;

  // ── Helpers ──────────────────────────────────────────────────────

  function areAllSectionsQAApproved(sectionStatuses) {
    if (!sectionStatuses || Object.keys(sectionStatuses).length === 0) return false;
    return Object.values(sectionStatuses).every(
      (s) => s.status === SECTION_STATUS.QA_APPROVED
    );
  }

  function hasVideoUploaded(item) {
    const json = item.toJSON ? item.toJSON() : item;
    return !!(json.video_data && json.video_data.youtubeUrl);
  }

  // ── 1. getQAProductionQueue ──────────────────────────────────────

  async function getQAProductionQueue() {
    const items = await OrderItem.findAll({
      where: {
        status: {
          [Op.in]: [
            ORDER_ITEM_STATUS.QUALITY_ASSURANCE,
            ORDER_ITEM_STATUS.ALL_SECTIONS_QA_APPROVED,
            ORDER_ITEM_STATUS.VIDEO_UPLOADED,
            ORDER_ITEM_STATUS.READY_FOR_CLIENT_APPROVAL,
          ],
        },
      },
      include: [
        {
          model: Order,
          as: "order",
          attributes: ["id", "order_number", "customer_name", "fwd_date", "status"],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    const queue = [];

    for (const item of items) {
      const json = item.toJSON();
      const ss = json.section_statuses || {};
      const order = json.order;
      if (!order) continue;

      const pendingSections = [];
      const approvedSections = [];
      const rejectedSections = [];

      Object.entries(ss).forEach(([key, data]) => {
        const info = {
          name: key,
          displayName: key.charAt(0).toUpperCase() + key.slice(1),
          status: data.status,
          qaData: data.qaData || { currentRound: 1, rounds: [] },
          // Rework context — passed to frontend for QA to see why section is back
          isAlteration: data.isAlteration || false,
          alterationNotes: data.alterationNotes || null,
          alterationRequestedBy: data.alterationRequestedBy || null,
          alterationRequestedAt: data.alterationRequestedAt || null,
        };
        if (data.status === SECTION_STATUS.QA_PENDING) pendingSections.push(info);
        else if (data.status === SECTION_STATUS.QA_APPROVED) approvedSections.push(info);
        else if (data.status === SECTION_STATUS.QA_REJECTED) rejectedSections.push(info);
      });

      const allApproved = areAllSectionsQAApproved(ss);
      const hasVideo = !!(json.video_data && json.video_data.youtubeUrl);

      // Determine if order is already sent to sales
      const orderSentToSales = [
        "READY_FOR_CLIENT_APPROVAL",
        "AWAITING_CLIENT_APPROVAL",
        "CLIENT_APPROVED",
        "READY_FOR_DISPATCH",
        "DISPATCHED",
        "COMPLETED",
      ].includes(order.status);

      // Include if: has pending, all approved but no video, has video but not sent to sales, or has rejected
      if (
        pendingSections.length > 0 ||
        (allApproved && !hasVideo) ||
        (allApproved && hasVideo && !orderSentToSales) ||
        rejectedSections.length > 0
      ) {
        // Check if ALL order items in this order have videos
        const allOrderItems = await OrderItem.findAll({
          where: { order_id: order.id },
          attributes: ["id", "video_data"],
        });
        const allHaveVideos = allOrderItems.every(
          (oi) => oi.video_data && oi.video_data.youtubeUrl
        );

        queue.push({
          orderItemId: json.id,
          orderId: order.id,
          orderNumber: order.order_number,
          customerName: order.customer_name,
          productName: json.product_name,
          productSku: json.product_sku,
          fwdDate: order.fwd_date,
          totalSections: Object.keys(ss).length,
          pendingSections,
          approvedSections,
          rejectedSections,
          allSectionsApproved: allApproved,
          hasVideo,
          videoData: json.video_data || null,
          reVideoRequest: json.re_video_request || null,
          orderStatus: order.status,
          allOrderItemsHaveVideos: allHaveVideos,
        });
      }
    }

    // Sort: all-approved first, then by pending count
    queue.sort((a, b) => {
      if (a.allSectionsApproved && !b.allSectionsApproved) return -1;
      if (!a.allSectionsApproved && b.allSectionsApproved) return 1;
      return b.pendingSections.length - a.pendingSections.length;
    });

    return queue;
  }

  // ── 2. getSalesRequests ──────────────────────────────────────────

  async function getSalesRequests() {
    const items = await OrderItem.findAll({
      where: {
        re_video_request: { [Op.ne]: null },
      },
      include: [
        {
          model: Order,
          as: "order",
          attributes: ["id", "order_number", "customer_name", "fwd_date"],
        },
      ],
    });

    const requests = items.map((item) => {
      const json = item.toJSON();
      return {
        orderItemId: json.id,
        orderId: json.order?.id,
        orderNumber: json.order?.order_number,
        customerName: json.order?.customer_name,
        productName: json.product_name,
        fwdDate: json.order?.fwd_date,
        reVideoRequest: json.re_video_request,
        previousVideo: json.video_data || null,
      };
    });

    requests.sort(
      (a, b) =>
        new Date(a.reVideoRequest?.requestedAt || 0) -
        new Date(b.reVideoRequest?.requestedAt || 0)
    );

    return requests;
  }

  // ── 3. getQAStats ────────────────────────────────────────────────

  async function getQAStats() {
    let pendingReview = 0;
    let readyForVideo = 0;
    let videoUploaded = 0;
    let salesRequests = 0;

    const items = await OrderItem.findAll({
      where: {
        status: {
          [Op.in]: [
            ORDER_ITEM_STATUS.QUALITY_ASSURANCE,
            ORDER_ITEM_STATUS.ALL_SECTIONS_QA_APPROVED,
            ORDER_ITEM_STATUS.VIDEO_UPLOADED,
            ORDER_ITEM_STATUS.READY_FOR_CLIENT_APPROVAL,
          ],
        },
      },
      include: [
        { model: Order, as: "order", attributes: ["id", "status"] },
      ],
    });

    for (const item of items) {
      const json = item.toJSON();
      const ss = json.section_statuses || {};

      const hasPending = Object.values(ss).some(
        (s) => s.status === SECTION_STATUS.QA_PENDING
      );
      const allApproved = areAllSectionsQAApproved(ss);
      const hasVideo = !!(json.video_data && json.video_data.youtubeUrl);

      if (hasPending) pendingReview++;
      if (allApproved && !hasVideo) readyForVideo++;
      if (hasVideo) {
        const orderSentToSales = [
          "READY_FOR_CLIENT_APPROVAL", "AWAITING_CLIENT_APPROVAL",
          "CLIENT_APPROVED", "READY_FOR_DISPATCH", "DISPATCHED", "COMPLETED",
        ].includes(json.order?.status);
        if (!orderSentToSales) videoUploaded++;
      }
      if (json.re_video_request) salesRequests++;
    }

    return { pendingReview, readyForVideo, videoUploaded, salesRequests };
  }

  // ── 4. approveSection ────────────────────────────────────────────

  async function approveSection(orderItemId, sectionName, approvedBy) {
    return sequelize.transaction(async (t) => {
      const item = await OrderItem.findByPk(orderItemId, { transaction: t });
      if (!item) throw serviceError("Order item not found", 404, "NOT_FOUND");

      const sectionKey = sectionName.toLowerCase();
      const ss = item.section_statuses || {};
      if (!ss[sectionKey]) throw serviceError("Section not found", 404, "SECTION_NOT_FOUND");

      if (ss[sectionKey].status !== SECTION_STATUS.QA_PENDING) {
        throw serviceError(
          `Section must be in QA_PENDING status. Current: ${ss[sectionKey].status}`,
          400, "INVALID_STATUS"
        );
      }

      const now = new Date().toISOString();
      const user = await User.findByPk(approvedBy, { attributes: ["id", "name"], transaction: t });

      // Initialize qaData
      if (!ss[sectionKey].qaData) ss[sectionKey].qaData = { currentRound: 1, rounds: [] };
      const currentRound = ss[sectionKey].qaData.currentRound || 1;

      // Record approval in rounds
      ss[sectionKey].qaData.rounds.push({
        round: currentRound,
        status: "APPROVED",
        reviewedBy: approvedBy,
        reviewedByName: user?.name || "Unknown",
        reviewedAt: now,
      });

      ss[sectionKey].status = SECTION_STATUS.QA_APPROVED;
      ss[sectionKey].qaApprovedAt = now;
      ss[sectionKey].qaApprovedBy = approvedBy;
      ss[sectionKey].updatedAt = now;

      // Create QaReview record
      await QaReview.create({
        order_item_id: orderItemId,
        section_name: sectionKey,
        round: currentRound,
        status: "APPROVED",
        reviewed_by: approvedBy,
        reviewed_by_name: user?.name || "Unknown",
        reviewed_at: now,
      }, { transaction: t });

      // Check if all sections approved
      const allApproved = Object.values(ss).every(
        (s) => s.status === SECTION_STATUS.QA_APPROVED
      );

      if (allApproved) {
        safeUpdateOrderItemStatus(item, ORDER_ITEM_STATUS.ALL_SECTIONS_QA_APPROVED);
      }

      // Update section in order_item_sections table
      await OrderItemSection.update(
        { status: SECTION_STATUS.QA_APPROVED, status_updated_at: now, status_updated_by: approvedBy },
        { where: { order_item_id: orderItemId, piece: { [Op.iLike]: sectionKey } }, transaction: t }
      );

      item.changed("section_statuses", true);
      await item.update({ section_statuses: { ...ss }, status: item.status }, { transaction: t });

      // Timeline
      const displayName = sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1);
      await OrderActivity.create({
        order_id: item.order_id,
        order_item_id: orderItemId,
        action: "QA_SECTION_APPROVED",
        description: `${displayName} approved by QA (Round ${currentRound})`,
        performed_by: approvedBy,
        metadata: { sectionName: sectionKey, round: currentRound },
      }, { transaction: t });

      return {
        sectionName: sectionKey,
        status: SECTION_STATUS.QA_APPROVED,
        round: currentRound,
        allSectionsApproved: allApproved,
      };
    });
  }

  // ── 5. rejectSection ─────────────────────────────────────────────

  async function rejectSection(orderItemId, sectionName, { rejectedBy, reasonCode, notes }) {
    return sequelize.transaction(async (t) => {
      const item = await OrderItem.findByPk(orderItemId, { transaction: t });
      if (!item) throw serviceError("Order item not found", 404, "NOT_FOUND");

      const sectionKey = sectionName.toLowerCase();
      const ss = item.section_statuses || {};
      if (!ss[sectionKey]) throw serviceError("Section not found", 404, "SECTION_NOT_FOUND");

      if (ss[sectionKey].status !== SECTION_STATUS.QA_PENDING) {
        throw serviceError(
          `Section must be in QA_PENDING status. Current: ${ss[sectionKey].status}`,
          400, "INVALID_STATUS"
        );
      }

      if (!notes || notes.trim() === "") {
        throw serviceError("Rejection notes are required", 400, "NOTES_REQUIRED");
      }

      const now = new Date().toISOString();
      const user = await User.findByPk(rejectedBy, { attributes: ["id", "name"], transaction: t });

      if (!ss[sectionKey].qaData) ss[sectionKey].qaData = { currentRound: 1, rounds: [] };
      const currentRound = ss[sectionKey].qaData.currentRound || 1;

      // Record rejection
      ss[sectionKey].qaData.rounds.push({
        round: currentRound,
        status: "REJECTED",
        reviewedBy: rejectedBy,
        reviewedByName: user?.name || "Unknown",
        reviewedAt: now,
        reasonCode,
        notes,
      });

      ss[sectionKey].qaData.currentRound = currentRound + 1;
      ss[sectionKey].status = SECTION_STATUS.QA_REJECTED;
      ss[sectionKey].qaRejectedAt = now;
      ss[sectionKey].qaRejectedBy = rejectedBy;
      ss[sectionKey].qaRejectionReason = reasonCode;
      ss[sectionKey].qaRejectionNotes = notes;
      ss[sectionKey].updatedAt = now;

      // Create QaReview record
      await QaReview.create({
        order_item_id: orderItemId,
        section_name: sectionKey,
        round: currentRound,
        status: "REJECTED",
        reviewed_by: rejectedBy,
        reviewed_by_name: user?.name || "Unknown",
        reviewed_at: now,
        rejection_reason_code: reasonCode,
        rejection_reason: reasonCode,
        rejection_notes: notes,
      }, { transaction: t });

      // Update order item status — calculate based on sections
      // If any section is rejected, item goes back toward production
      safeUpdateOrderItemStatus(item, ORDER_ITEM_STATUS.QUALITY_ASSURANCE);

      await OrderItemSection.update(
        { status: SECTION_STATUS.QA_REJECTED, status_updated_at: now, status_updated_by: rejectedBy },
        { where: { order_item_id: orderItemId, piece: { [Op.iLike]: sectionKey } }, transaction: t }
      );

      notify.qaRejected(orderItemId, sectionName, reasonCode);

      item.changed("section_statuses", true);
      await item.update({ section_statuses: { ...ss }, status: item.status }, { transaction: t });

      const displayName = sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1);
      await OrderActivity.create({
        order_id: item.order_id,
        order_item_id: orderItemId,
        action: "QA_SECTION_REJECTED",
        description: `${displayName} rejected by QA (Round ${currentRound}) - ${reasonCode}: ${notes}`,
        performed_by: rejectedBy,
        metadata: { sectionName: sectionKey, round: currentRound, reasonCode, notes },
      }, { transaction: t });

      return {
        sectionName: sectionKey,
        status: SECTION_STATUS.QA_REJECTED,
        round: currentRound,
        nextRound: currentRound + 1,
        rejectionReason: reasonCode,
        notes,
      };
    });
  }

  // ── 6. uploadOrderItemVideo ──────────────────────────────────────

  async function uploadOrderItemVideo(orderItemId, { youtubeUrl, youtubeVideoId, uploadedBy, originalFileName, originalFileSize }) {
    return sequelize.transaction(async (t) => {
      const item = await OrderItem.findByPk(orderItemId, { transaction: t });
      if (!item) throw serviceError("Order item not found", 404, "NOT_FOUND");

      const ss = item.section_statuses || {};
      if (!areAllSectionsQAApproved(ss)) {
        throw serviceError(
          "All sections must be QA_APPROVED before uploading video",
          400, "SECTIONS_NOT_APPROVED"
        );
      }

      const now = new Date().toISOString();
      const user = await User.findByPk(uploadedBy, { attributes: ["id", "name"], transaction: t });

      const videoData = {
        youtubeUrl,
        youtubeVideoId,
        uploadedBy,
        uploadedByName: user?.name || "Unknown",
        uploadedAt: now,
        originalFileName: originalFileName || null,
        originalFileSize: originalFileSize || null,
        videoHistory: item.video_data?.videoHistory || [],
      };

      safeUpdateOrderItemStatus(item, ORDER_ITEM_STATUS.VIDEO_UPLOADED);

      await item.update({ video_data: videoData, status: item.status }, { transaction: t });

      await OrderActivity.create({
        order_id: item.order_id,
        order_item_id: orderItemId,
        action: "VIDEO_UPLOADED",
        description: `YouTube video uploaded (${originalFileName || "video"})`,
        performed_by: uploadedBy,
        metadata: { youtubeUrl, fileName: originalFileName },
      }, { transaction: t });

      return {
        orderItemId,
        videoData,
        status: ORDER_ITEM_STATUS.VIDEO_UPLOADED,
      };
    });
  }

  // ── 7. uploadReVideo ─────────────────────────────────────────────

  async function uploadReVideo(orderItemId, { youtubeUrl, youtubeVideoId, uploadedBy, originalFileName, originalFileSize }) {
    return sequelize.transaction(async (t) => {
      const item = await OrderItem.findByPk(orderItemId, { transaction: t });
      if (!item) throw serviceError("Order item not found", 404, "NOT_FOUND");

      if (!item.re_video_request) {
        throw serviceError("No re-video request found for this order item", 400, "NO_REQUEST");
      }

      const now = new Date().toISOString();
      const user = await User.findByPk(uploadedBy, { attributes: ["id", "name"], transaction: t });

      // Move old video to history
      const videoHistory = item.video_data?.videoHistory || [];
      if (item.video_data?.youtubeUrl) {
        videoHistory.push({
          version: videoHistory.length + 1,
          youtubeUrl: item.video_data.youtubeUrl,
          uploadedAt: item.video_data.uploadedAt,
          replacedAt: now,
          replacedReason: "Re-video requested by Sales",
        });
      }

      // Capture previous video for frontend display
      const previousVideo = item.video_data?.youtubeUrl
        ? {
            youtubeUrl: item.video_data.youtubeUrl,
            youtubeVideoId: item.video_data.youtubeVideoId,
            uploadedBy: item.video_data.uploadedBy,
            uploadedByName: item.video_data.uploadedByName,
            uploadedAt: item.video_data.uploadedAt,
          }
        : null;

      const videoData = {
        youtubeUrl,
        youtubeVideoId,
        uploadedBy,
        uploadedByName: user?.name || "Unknown",
        uploadedAt: now,
        originalFileName: originalFileName || null,
        originalFileSize: originalFileSize || null,
        videoHistory,
        previousVideo,
      };

      safeUpdateOrderItemStatus(item, ORDER_ITEM_STATUS.VIDEO_UPLOADED);

      await item.update(
        { video_data: videoData, re_video_request: null, status: item.status },
        { transaction: t }
      );

      await OrderActivity.create({
        order_id: item.order_id,
        order_item_id: orderItemId,
        action: "RE_VIDEO_UPLOADED",
        description: `New video uploaded - re-video request fulfilled (${originalFileName || "video"})`,
        performed_by: uploadedBy,
        metadata: { youtubeUrl, fileName: originalFileName },
      }, { transaction: t });

      // Notify sales that the re-video is ready
      const order = await Order.findByPk(item.order_id, {
        attributes: ["order_number"],
        transaction: t,
      });
      notify.reVideoUploaded(item.order_id, order?.order_number);

      return {
        orderItemId,
        videoData,
        status: ORDER_ITEM_STATUS.VIDEO_UPLOADED,
      };
    });
  }

  // ── 8. sendOrderToSales ──────────────────────────────────────────

  async function sendOrderToSales(orderId, sentBy) {
    return sequelize.transaction(async (t) => {
      const order = await Order.findByPk(orderId, { transaction: t });
      if (!order) throw serviceError("Order not found", 404, "NOT_FOUND");

      // Validate all order items have videos
      const orderItems = await OrderItem.findAll({
        where: { order_id: orderId },
        transaction: t,
      });

      const allHaveVideos = orderItems.every(
        (oi) => oi.video_data && oi.video_data.youtubeUrl
      );

      if (!allHaveVideos) {
        throw serviceError(
          "All order items must have videos uploaded before sending to Sales",
          400, "VIDEOS_MISSING"
        );
      }

      const now = new Date().toISOString();
      const user = await User.findByPk(sentBy, { attributes: ["id", "name"], transaction: t });

      safeUpdateOrderStatus(order, ORDER_STATUS.READY_FOR_CLIENT_APPROVAL);
      await order.update({ status: order.status, updated_at: now }, { transaction: t });

      // Update all order items
      for (const oi of orderItems) {
        safeUpdateOrderItemStatus(oi, ORDER_ITEM_STATUS.READY_FOR_CLIENT_APPROVAL);
        await oi.update({ status: oi.status }, { transaction: t });
      }

      await OrderActivity.create({
        order_id: orderId,
        action: "SENT_TO_SALES",
        description: `Order sent to Sales for client approval`,
        performed_by: sentBy,
      }, { transaction: t });

      notify.sentToSales(orderId, order.order_number);

      return {
        orderId,
        orderNumber: order.order_number,
        status: ORDER_STATUS.READY_FOR_CLIENT_APPROVAL,
      };
    });
  }

  // ── 9. getOrderItemForQA ─────────────────────────────────────────

  async function getOrderItemForQA(orderItemId) {
    const item = await OrderItem.findByPk(orderItemId, {
      include: [
        {
          model: Order,
          as: "order",
          attributes: ["id", "order_number", "customer_name", "fwd_date", "status"],
        },
      ],
    });
    if (!item) throw serviceError("Order item not found", 404, "NOT_FOUND");

    const json = item.toJSON();
    return {
      ...json,
      id: json.id,
      orderId: json.order_id,
      orderNumber: json.order?.order_number,
      customerName: json.order?.customer_name,
      fwdDate: json.order?.fwd_date,
      productName: json.product_name,
      productSku: json.product_sku,
      sectionStatuses: json.section_statuses || {},
      videoData: json.video_data || null,
      reVideoRequest: json.re_video_request || null,
      status: json.status,
    };
  }

  return {
    getQAProductionQueue,
    getSalesRequests,
    getQAStats,
    approveSection,
    rejectSection,
    uploadOrderItemVideo,
    uploadReVideo,
    sendOrderToSales,
    getOrderItemForQA,
  };
};