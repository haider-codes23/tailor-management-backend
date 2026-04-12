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

// ─────────────────────────────────────────────────────────────────────
// YouTube description builder — composes a rich multi-line description
// from order + order item data for the QA video.
// ─────────────────────────────────────────────────────────────────────
function buildYoutubeDescription(item, order, isReVideo = false) {
  const lines = [];

  if (isReVideo) {
    lines.push("Re-video upload per Sales request.", "");
  } else {
    lines.push("Quality assurance video for order review.", "");
  }

  // ── Order header ──
  lines.push("━━━ ORDER DETAILS ━━━");
  if (order?.order_number) lines.push(`Order Number: ${order.order_number}`);
  if (order?.customer_name) lines.push(`Customer: ${order.customer_name}`);
  if (order?.destination) lines.push(`Destination: ${order.destination}`);
  if (order?.fwd_date) lines.push(`FWD Date: ${formatYmd(order.fwd_date)}`);
  if (order?.production_shipping_date) {
    lines.push(`Production Shipping Date: ${formatYmd(order.production_shipping_date)}`);
  }
  if (order?.urgent) lines.push(`Urgent: Yes`);
  if (order?.items?.length) lines.push(`Total Items in Order: ${order.items.length}`);
  lines.push("");

  // ── This item ──
  lines.push("━━━ THIS ITEM ━━━");
  lines.push(`Product: ${item?.product_name || "N/A"}`);
  if (item?.product_sku) lines.push(`SKU: ${item.product_sku}`);
  if (item?.quantity) lines.push(`Quantity: ${item.quantity}`);

  // Size
  const sizeType = (item?.size_type || "").toUpperCase();
  if (sizeType === "STANDARD") {
    lines.push(`Size: ${item?.size || "N/A"} (Standard)`);
  } else if (sizeType === "CUSTOM") {
    lines.push(`Size: Custom`);
  }

  if (item?.height_range) lines.push(`Height Range: ${item.height_range}`);
  if (item?.modesty) lines.push(`Modesty: ${item.modesty}`);
  lines.push("");

  // ── Included items (MAIN sections) ──
  const included = Array.isArray(item?.included_items) ? item.included_items : [];
  if (included.length > 0) {
    lines.push("━━━ INCLUDED ITEMS ━━━");
    for (const inc of included) {
      const price = inc.price ? ` — PKR ${formatNumber(inc.price)}` : "";
      lines.push(`• ${capitalize(inc.piece)}${price}`);
    }
    lines.push("");
  }

  // ── Add-ons ──
  const addOns = Array.isArray(item?.selected_add_ons) ? item.selected_add_ons : [];
  if (addOns.length > 0) {
    lines.push("━━━ ADD-ONS ━━━");
    for (const ao of addOns) {
      const price = ao.price ? ` — PKR ${formatNumber(ao.price)}` : "";
      lines.push(`• ${capitalize(ao.piece)}${price}`);
    }
    lines.push("");
  }

  // ── Customizations ──
  const customizations = [];
  const formatCust = (label, c) => {
    if (!c) return;
    const type = (c.type || "original").toLowerCase();
    if (type === "original") {
      customizations.push(`${label}: Original`);
    } else {
      const detail =
        typeof c.details === "string"
          ? c.details
          : c.details && Object.keys(c.details).length > 0
            ? JSON.stringify(c.details)
            : "";
      customizations.push(`${label}: ${capitalize(type)}${detail ? ` — ${detail}` : ""}`);
    }
  };
  formatCust("Style", item?.style);
  formatCust("Color", item?.color);
  formatCust("Fabric", item?.fabric);
  if (customizations.length > 0) {
    lines.push("━━━ CUSTOMIZATIONS ━━━");
    customizations.forEach((c) => lines.push(c));
    lines.push("");
  }

  // ── Garment notes ──
  const garmentNotesText = stringifyNotes(item?.garment_notes);
  if (garmentNotesText) {
    lines.push("━━━ GARMENT NOTES ━━━");
    lines.push(garmentNotesText);
    lines.push("");
  }

  // ── Item-level notes ──
  const itemNotesText = stringifyNotes(item?.notes);
  if (itemNotesText) {
    lines.push("━━━ NOTES ━━━");
    lines.push(itemNotesText);
    lines.push("");
  }

  // Truncate at YouTube's 5000-char limit (safety margin)
  const full = lines.join("\n").trim();
  return full.length > 4900 ? full.slice(0, 4900) + "\n…(truncated)" : full;
}

function capitalize(s) {
  if (!s || typeof s !== "string") return s || "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function stringifyNotes(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) {
    return value.map((v) => stringifyNotes(v)).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    // Try common fields first, then fall back to a readable key: value dump
    if (typeof value.text === "string") return value.text.trim();
    if (typeof value.note === "string") return value.note.trim();
    if (typeof value.content === "string") return value.content.trim();
    return Object.entries(value)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${capitalize(k)}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join("\n");
  }
  return String(value);
}

function formatNumber(n) {
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString("en-PK");
}

function formatYmd(d) {
  if (!d) return "";
  try {
    const date = new Date(d);
    return date.toISOString().slice(0, 10);
  } catch {
    return String(d);
  }
}

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
      include: [
        {
          model: db.Order,
          as: "order",
          attributes: [
            "id",
            "order_number",
            "customer_name",
            "destination",
            "fwd_date",
            "production_shipping_date",
            "urgent",
          ],
          include: [
            {
              model: db.OrderItem,
              as: "items",
              attributes: ["id"],
            },
          ],
        },
      ],
    });

    // Build title — keep concise (YouTube limit is 100 chars)
    const title = item
      ? `${item.order?.order_number || "Order"} - ${item.order?.customer_name || "Customer"} - ${item.product_name}`
      : `QA Video - ${orderItemId}`;

    // Build rich description with all item details
    const description = item
      ? buildYoutubeDescription(item, item.order, false)
      : "Quality assurance video for order review.";

    // Upload to YouTube
    const ytResult = await uploadVideo({
      filePath: file.path,
      title,
      description,
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
      include: [
        {
          model: db.Order,
          as: "order",
          attributes: [
            "id",
            "order_number",
            "customer_name",
            "destination",
            "fwd_date",
            "production_shipping_date",
            "urgent",
          ],
          include: [
            {
              model: db.OrderItem,
              as: "items",
              attributes: ["id"],
            },
          ],
        },
      ],
    });

    const title = item
      ? `${item.order?.order_number || "Order"} - ${item.order?.customer_name || "Customer"} - ${item.product_name} (Re-video)`
      : `QA Re-Video - ${orderItemId}`;

    const description = item
      ? buildYoutubeDescription(item, item.order, true)
      : "Re-video upload per Sales request.";

    const ytResult = await uploadVideo({
      filePath: file.path,
      title,
      description,
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