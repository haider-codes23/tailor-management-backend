/**
 * Dashboard Routes — Phase 17
 * Mounted at /api/dashboard
 *
 * All routes require authentication and the `reports.view` permission.
 * Both Admin and Sales should have this permission to see the dashboard.
 */

const express = require("express");
const router = express.Router();
const { authenticate, requirePermission } = require("../middleware/auth");
const ctrl = require("../controllers/dashboardController");

// All routes require authentication
router.use(authenticate);

// ── Dashboard Widgets ───────────────────────────────────────────────

router.get(
  "/order-funnel",
  requirePermission("reports.view"),
  ctrl.getOrderFunnel
);

router.get(
  "/production-pipeline",
  requirePermission("reports.view"),
  ctrl.getProductionPipeline
);

router.get(
  "/inventory-alerts",
  requirePermission("reports.view"),
  ctrl.getInventoryAlerts
);

router.get(
  "/qa-metrics",
  requirePermission("reports.view"),
  ctrl.getQAMetrics
);

router.get(
  "/sales-summary",
  requirePermission("reports.view"),
  ctrl.getSalesSummary
);

router.get(
  "/recent-activity",
  requirePermission("reports.view"),
  ctrl.getRecentActivity
);

module.exports = router;