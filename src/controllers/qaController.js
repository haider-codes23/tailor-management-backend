/**
 * QA Controller — Phase 13
 *
 * Thin HTTP handlers. Business logic lives in qaService.js.
 * Video uploads use multer + youtubeService for real YouTube integration.
 */

const db = require("../models");
const createQaService = require("../services/qaService");
const { uploadVideo } = require("../services/youtubeService");

const qaService = createQaService(db);

// ── GET /api/qa/queue ──────────────────────────────────────────────
exports.getQAProductionQueue = async (req, res, next) => {
  try {
    const data = await qaService.getQAProductionQueue();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/qa/sales-requests ─────────────────────────────────────
exports.getSalesRequests = async (req, res, next) => {
  try {
    const data = await qaService.getSalesRequests();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/qa/stats ──────────────────────────────────────────────
exports.getQAStats = async (req, res, next) => {
  try {
    const data = await qaService.getQAStats();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/qa/section/:orderItemId/:section/approve ─────────────
exports.approveSection = async (req, res, next) => {
  try {
    const { orderItemId, section } = req.params;
    const { approvedBy } = req.body;
    const userId = approvedBy || req.user?.id;

    const data = await qaService.approveSection(orderItemId, section, userId);
    res.json({ success: true, message: `${section} approved by QA`, data });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/qa/section/:orderItemId/:section/reject ──────────────
exports.rejectSection = async (req, res, next) => {
  try {
    const { orderItemId, section } = req.params;
    const { rejectedBy, reasonCode, notes } = req.body;
    const userId = rejectedBy || req.user?.id;

    const data = await qaService.rejectSection(orderItemId, section, {
      rejectedBy: userId,
      reasonCode,
      notes,
    });
    res.json({
      success: true,
      message: `${section} rejected - sent back to Production`,
      data,
    });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/qa/order-item/:orderItemId/upload-video ──────────────
exports.uploadOrderItemVideo = async (req, res, next) => {
  try {
    const { orderItemId } = req.params;
    const file = req.file;
    const uploadedBy = req.body.uploadedBy || req.user?.id;

    if (!file) {
      return res.status(400).json({ success: false, error: "Video file is required" });
    }

    // Fetch order item to build a meaningful YouTube title
    const item = await db.OrderItem.findByPk(orderItemId, {
      include: [{ model: db.Order, as: "order", attributes: ["order_number", "customer_name"] }],
    });
    const title = item
      ? `${item.order?.order_number || "Order"} - ${item.order?.customer_name || "Customer"} - ${item.product_name}`
      : `QA Video - ${orderItemId}`;

    // Upload to YouTube
    const ytResult = await uploadVideo({
      filePath: file.path,
      title,
      description: `Quality assurance video for order review. Product: ${item?.product_name || "N/A"}`,
      privacyStatus: "unlisted",
    });

    // Save to DB
    const data = await qaService.uploadOrderItemVideo(orderItemId, {
      youtubeUrl: ytResult.youtubeUrl,
      youtubeVideoId: ytResult.youtubeVideoId,
      uploadedBy,
      originalFileName: file.originalname,
      originalFileSize: file.size,
    });

    res.json({ success: true, message: "Video uploaded to YouTube successfully", data });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/qa/order-item/:orderItemId/upload-revideo ────────────
exports.uploadReVideo = async (req, res, next) => {
  try {
    const { orderItemId } = req.params;
    const file = req.file;
    const uploadedBy = req.body.uploadedBy || req.user?.id;

    if (!file) {
      return res.status(400).json({ success: false, error: "Video file is required" });
    }

    const item = await db.OrderItem.findByPk(orderItemId, {
      include: [{ model: db.Order, as: "order", attributes: ["order_number", "customer_name"] }],
    });
    const title = item
      ? `${item.order?.order_number || "Order"} - ${item.order?.customer_name || "Customer"} - ${item.product_name} (Re-video)`
      : `QA Re-Video - ${orderItemId}`;

    const ytResult = await uploadVideo({
      filePath: file.path,
      title,
      description: `Re-video upload per Sales request. Product: ${item?.product_name || "N/A"}`,
      privacyStatus: "unlisted",
    });

    const data = await qaService.uploadReVideo(orderItemId, {
      youtubeUrl: ytResult.youtubeUrl,
      youtubeVideoId: ytResult.youtubeVideoId,
      uploadedBy,
      originalFileName: file.originalname,
      originalFileSize: file.size,
    });

    res.json({ success: true, message: "Re-video uploaded to YouTube successfully", data });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/qa/order/:orderId/send-to-sales ──────────────────────
exports.sendOrderToSales = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { sentBy } = req.body;
    const userId = sentBy || req.user?.id;

    const data = await qaService.sendOrderToSales(orderId, userId);
    res.json({ success: true, message: "Order sent to Sales for client approval", data });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/qa/order-item/:orderItemId ────────────────────────────
exports.getOrderItemForQA = async (req, res, next) => {
  try {
    const { orderItemId } = req.params;
    const data = await qaService.getOrderItemForQA(orderItemId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};