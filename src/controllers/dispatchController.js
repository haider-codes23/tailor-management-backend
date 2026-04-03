/**
 * Dispatch Controller — Phase 14
 * Thin HTTP handlers. Business logic lives in dispatchService.js.
 */

const db = require("../models");
const createDispatchService = require("../services/dispatchService");

const dispatchService = createDispatchService(db);

// GET /api/dispatch/queue
exports.getDispatchQueue = async (req, res, next) => {
  try {
    const data = await dispatchService.getDispatchQueue();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/dispatch/dispatched
exports.getDispatched = async (req, res, next) => {
  try {
    const data = await dispatchService.getDispatched();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/dispatch/completed
exports.getCompleted = async (req, res, next) => {
  try {
    const data = await dispatchService.getCompleted();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// GET /api/dispatch/stats
exports.getDispatchStats = async (req, res, next) => {
  try {
    const data = await dispatchService.getDispatchStats();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// POST /api/dispatch/order/:orderId/dispatch
exports.dispatchOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { courier, trackingNumber, dispatchDate, notes, dispatchedBy } =
      req.body;
    const data = await dispatchService.dispatchOrder(orderId, {
      courier,
      trackingNumber,
      dispatchDate,
      notes,
      dispatchedBy,
    });
    res.json({ success: true, message: "Order dispatched successfully", data });
  } catch (err) {
    if (err.statusCode) {
      return res
        .status(err.statusCode)
        .json({ error: err.code, message: err.message });
    }
    next(err);
  }
};

// POST /api/dispatch/order/:orderId/complete
exports.completeOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { completedBy } = req.body;
    const data = await dispatchService.completeOrder(orderId, completedBy);
    res.json({
      success: true,
      message: "Order completed successfully",
      data,
    });
  } catch (err) {
    if (err.statusCode) {
      return res
        .status(err.statusCode)
        .json({ error: err.code, message: err.message });
    }
    next(err);
  }
};