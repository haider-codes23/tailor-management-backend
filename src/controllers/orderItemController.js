/**
 * Order Item Controller
 *
 * Thin HTTP layer for order item endpoints.
 * Delegates to orderItemService and serializes responses.
 */

const orderItemService = require("../services/orderItemService");
const { serializeOrderItem } = require("../utils/orderItemSerializer");

// ─── GET /api/order-items/:id ─────────────────────────────────────────

async function getOrderItem(req, res, next) {
  try {
    const { item, timeline } = await orderItemService.getOrderItemById(req.params.id);
    return res.json({
      success: true,
      data: serializeOrderItem(item, { timeline }),
    });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/order-items/:id ─────────────────────────────────────────

async function updateOrderItem(req, res, next) {
  try {
    const { item, timeline } = await orderItemService.updateOrderItem(
      req.params.id,
      req.body,
      req.user
    );
    return res.json({
      success: true,
      data: serializeOrderItem(item, { timeline }),
    });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/order-items/:id ──────────────────────────────────────

async function deleteOrderItem(req, res, next) {
  try {
    const result = await orderItemService.deleteOrderItem(req.params.id);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/orders/:orderId/items ──────────────────────────────────

async function addOrderItem(req, res, next) {
  try {
    const { item, timeline } = await orderItemService.addOrderItem(
      req.params.orderId,
      req.body,
      req.user
    );
    return res.status(201).json({
      success: true,
      data: serializeOrderItem(item, { timeline }),
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/order-items/:id/timeline ───────────────────────────────

async function addTimelineEntry(req, res, next) {
  try {
    const entry = await orderItemService.addTimelineEntry(
      req.params.id,
      req.body,
      req.user
    );
    return res.json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/order-items/:id/generate-form ──────────────────────────

async function generateForm(req, res, next) {
  try {
    const { item, timeline } = await orderItemService.generateForm(
      req.params.id,
      req.body,
      req.user
    );
    return res.json({
      success: true,
      data: serializeOrderItem(item, { timeline }),
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/order-items/:id/approve-form ───────────────────────────

async function approveForm(req, res, next) {
  try {
    const { item, timeline } = await orderItemService.approveForm(
      req.params.id,
      req.body,
      req.user
    );
    return res.json({
      success: true,
      data: serializeOrderItem(item, { timeline }),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOrderItem,
  updateOrderItem,
  deleteOrderItem,
  addOrderItem,
  addTimelineEntry,
  generateForm,
  approveForm,
};