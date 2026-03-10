/**
 * Order Controller
 *
 * Thin HTTP layer — delegates to orderService.
 *
 * Response format matches frontend expectations:
 *   List:   { orders: [...], pagination: {...} }
 *   Detail: { success: true, data: { ...order, items: [...] } }
 *   Create: { success: true, data: { ... } }  (201)
 *   Update: { success: true, data: { ... } }
 *   Delete: { success: true, data: { ... } }
 */

const orderService = require("../services/orderService");

// =========================================================================
// GET /api/orders — List orders with filters
// =========================================================================

async function listOrders(req, res, next) {
  try {
    const {
      search, status, source, urgent, consultantId,
      fulfillment_source, payment_status,
      page = 1, limit = 25,
    } = req.query;

    const result = await orderService.listOrders({
      search,
      status,
      source,
      urgent,
      consultantId,
      fulfillment_source,
      payment_status,
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 25,
    });

    // MSW returns { orders, pagination } — no { success, data } wrapper
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

// =========================================================================
// GET /api/orders/:id — Order detail
// =========================================================================

async function getOrder(req, res, next) {
  try {
    const order = await orderService.getOrderById(req.params.id);

    // MSW returns the order object directly (with computed fields)
    return res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

// =========================================================================
// POST /api/orders — Create order
// =========================================================================

async function createOrder(req, res, next) {
  try {
    const order = await orderService.createOrder(req.body, req.user);
    return res.status(201).json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

// =========================================================================
// PUT /api/orders/:id — Update order
// =========================================================================

async function updateOrder(req, res, next) {
  try {
    const order = await orderService.updateOrder(req.params.id, req.body, req.user);
    return res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

// =========================================================================
// DELETE /api/orders/:id — Cancel order
// =========================================================================

async function cancelOrder(req, res, next) {
  try {
    const order = await orderService.cancelOrder(req.params.id, req.user);
    return res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

// =========================================================================
// POST /api/orders/:id/notes — Add note
// =========================================================================

async function addNote(req, res, next) {
  try {
    const result = await orderService.addNote(req.params.id, req.body, req.user);
    return res.json(result);
  } catch (err) {
    next(err);
  }
}

// =========================================================================
// GET /api/orders/:id/timeline — Order timeline
// =========================================================================

async function getTimeline(req, res, next) {
  try {
    const activities = await orderService.getTimeline(req.params.id);
    return res.json({ success: true, data: activities });
  } catch (err) {
    next(err);
  }
}

// =========================================================================
// POST /api/orders/:id/payments — Add payment
// =========================================================================

async function addPayment(req, res, next) {
  try {
    const order = await orderService.addPayment(req.params.id, req.body, req.user);
    return res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

// =========================================================================
// DELETE /api/orders/:id/payments/:paymentId — Delete payment
// =========================================================================

async function deletePayment(req, res, next) {
  try {
    const order = await orderService.deletePayment(
      req.params.id, req.params.paymentId, req.user
    );
    return res.json({ success: true, data: order });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listOrders,
  getOrder,
  createOrder,
  updateOrder,
  cancelOrder,
  addNote,
  getTimeline,
  addPayment,
  deletePayment,
};