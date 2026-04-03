/**
 * QA Routes — Phase 13
 * Mounted at /api/qa
 */

const express = require("express");
const router = express.Router();
const { authenticate, requirePermission } = require("../middleware/auth");
const { videoUpload } = require("../config/multer");
const ctrl = require("../controllers/qaController");

// All routes require authentication
router.use(authenticate);

// ── Queue & Stats ───────────────────────────────────────────────────
router.get("/queue", requirePermission("qa.view"), ctrl.getQAProductionQueue);
router.get("/sales-requests", requirePermission("qa.view_sales_requests"), ctrl.getSalesRequests);
router.get("/stats", requirePermission("qa.view"), ctrl.getQAStats);

// ── Section Approval/Rejection ──────────────────────────────────────
router.post(
  "/section/:orderItemId/:section/approve",
  requirePermission("qa.approve"),
  ctrl.approveSection
);
router.post(
  "/section/:orderItemId/:section/reject",
  requirePermission("qa.reject"),
  ctrl.rejectSection
);

// ── Video Upload (multer handles FormData) ──────────────────────────
router.post(
  "/order-item/:orderItemId/upload-video",
  requirePermission("qa.upload_video"),
  videoUpload.single("videoFile"),
  ctrl.uploadOrderItemVideo
);
router.post(
  "/order-item/:orderItemId/upload-revideo",
  requirePermission("qa.upload_video"),
  videoUpload.single("videoFile"),
  ctrl.uploadReVideo
);

// ── Send to Sales ───────────────────────────────────────────────────
router.post(
  "/order/:orderId/send-to-sales",
  requirePermission("qa.send_to_sales"),
  ctrl.sendOrderToSales
);

// ── Order Item Details ──────────────────────────────────────────────
router.get(
  "/order-item/:orderItemId",
  requirePermission("qa.view"),
  ctrl.getOrderItemForQA
);

module.exports = router;