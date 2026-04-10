/**
 * Dashboard Controller — Phase 17
 *
 * Thin HTTP handlers that delegate to dashboardService.
 * All endpoints return { success: true, data: ... } envelope.
 */

const dashboardService = require("../services/dashboardService");

function handleError(res, err, defaultMsg = "Dashboard query failed") {
  console.error("Dashboard error:", err);
  const status = err.status || 500;
  return res.status(status).json({
    success: false,
    error: err.code || "DASHBOARD_ERROR",
    message: err.message || defaultMsg,
  });
}

// GET /api/dashboard/order-funnel
async function getOrderFunnel(req, res) {
  try {
    const data = await dashboardService.getOrderFunnel();
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

// GET /api/dashboard/production-pipeline
async function getProductionPipeline(req, res) {
  try {
    const data = await dashboardService.getProductionPipeline();
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

// GET /api/dashboard/inventory-alerts
async function getInventoryAlerts(req, res) {
  try {
    const data = await dashboardService.getInventoryAlerts();
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

// GET /api/dashboard/qa-metrics
async function getQAMetrics(req, res) {
  try {
    const data = await dashboardService.getQAMetrics();
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

// GET /api/dashboard/sales-summary
async function getSalesSummary(req, res) {
  try {
    const data = await dashboardService.getSalesSummary();
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

// GET /api/dashboard/recent-activity
async function getRecentActivity(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);
    const data = await dashboardService.getRecentActivity(limit);
    return res.json({ success: true, data });
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  getOrderFunnel,
  getProductionPipeline,
  getInventoryAlerts,
  getQAMetrics,
  getSalesSummary,
  getRecentActivity,
};