/**
 * Sales Approval Controller — Phase 13
 * Thin HTTP handlers. Business logic lives in salesApprovalService.js.
 */

const db = require("../models");
const createSalesService = require("../services/salesApprovalService");

const salesService = createSalesService(db);

exports.getApprovalQueue = async (req, res, next) => {
  try {
    const data = await salesService.getApprovalQueue();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.getAwaitingResponse = async (req, res, next) => {
  try {
    const data = await salesService.getAwaitingResponse();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.getAwaitingPayment = async (req, res, next) => {
  try {
    const data = await salesService.getAwaitingPayment();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.getSalesStats = async (req, res, next) => {
  try {
    const data = await salesService.getSalesStats();
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.getOrderDetails = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const data = await salesService.getOrderDetails(orderId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
};

exports.sendOrderToClient = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { sentBy } = req.body;
    const userId = sentBy || req.user?.id;
    const data = await salesService.sendOrderToClient(orderId, userId);
    res.json({ success: true, message: "Order sent to client for approval", data });
  } catch (err) { next(err); }
};

exports.markClientApproved = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { screenshots, notes, approvedBy } = req.body;
    const userId = approvedBy || req.user?.id;
    const data = await salesService.markClientApproved(orderId, { screenshots, notes, approvedBy: userId });
    res.json({ success: true, message: "Client approval recorded successfully", data });
  } catch (err) { next(err); }
};

exports.requestReVideo = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { orderItemId, sections, requestedBy } = req.body;
    const userId = requestedBy || req.user?.id;
    const data = await salesService.requestReVideo(orderId, { orderItemId, sections, requestedBy: userId });
    res.json({ success: true, message: "Re-video request sent to QA", data });
  } catch (err) { next(err); }
};

exports.requestAlteration = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { sections, requestedBy } = req.body;
    const userId = requestedBy || req.user?.id;
    const data = await salesService.requestAlteration(orderId, { sections, requestedBy: userId });
    res.json({ success: true, message: "Alteration request sent to production", data });
  } catch (err) { next(err); }
};

exports.cancelOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { reason, cancelledBy } = req.body;
    const userId = cancelledBy || req.user?.id;
    const data = await salesService.cancelOrder(orderId, { reason, cancelledBy: userId });
    res.json({ success: true, message: "Order cancelled", data });
  } catch (err) { next(err); }
};

exports.startFromScratch = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { confirmedBy, reason } = req.body;
    const userId = confirmedBy || req.user?.id;
    const data = await salesService.startFromScratch(orderId, { confirmedBy: userId, reason });
    res.json({ success: true, message: "Order reset to start from scratch", data });
  } catch (err) { next(err); }
};

exports.approvePayments = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { approvedBy } = req.body;
    const userId = approvedBy || req.user?.id;
    const data = await salesService.approvePayments(orderId, userId);
    res.json({ success: true, message: "Payments approved - Order ready for dispatch", data });
  } catch (err) { next(err); }
};