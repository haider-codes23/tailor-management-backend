/**
 * Sales Approval Routes — Phase 13
 * Mounted at /api/sales
 */

const express = require("express");
const router = express.Router();
const { authenticate, requirePermission } = require("../middleware/auth");
const ctrl = require("../controllers/salesApprovalController");

router.use(authenticate);

// ── 3-Tab Dashboard Queries ─────────────────────────────────────────
router.get("/approval-queue", requirePermission("sales.view_approval_queue"), ctrl.getApprovalQueue);
router.get("/awaiting-response", requirePermission("sales.view_approval_queue"), ctrl.getAwaitingResponse);
router.get("/awaiting-payment", requirePermission("sales.view_approval_queue"), ctrl.getAwaitingPayment);

// ── Stats ───────────────────────────────────────────────────────────
router.get("/stats", requirePermission("sales.view"), ctrl.getSalesStats);

// ── Order Details ───────────────────────────────────────────────────
router.get("/order/:orderId", requirePermission("sales.view"), ctrl.getOrderDetails);

// ── Order-Level Actions ─────────────────────────────────────────────
router.post("/order/:orderId/send-to-client", requirePermission("sales.send_to_client"), ctrl.sendOrderToClient);
router.post("/order/:orderId/client-approved", requirePermission("sales.mark_client_approved"), ctrl.markClientApproved);
router.post("/order/:orderId/request-revideo", requirePermission("sales.request_revideo"), ctrl.requestReVideo);
router.post("/order/:orderId/request-alteration", requirePermission("sales.request_alteration"), ctrl.requestAlteration);
router.post("/order/:orderId/client-rejected", requirePermission("sales.cancel_order"), ctrl.cancelOrder);
router.post("/order/:orderId/start-from-scratch", requirePermission("sales.start_from_scratch"), ctrl.startFromScratch);
router.post("/order/:orderId/approve-payments", requirePermission("sales.approve_payments"), ctrl.approvePayments);

module.exports = router;