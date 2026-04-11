/**
 * Production Routes — Phase 12
 * Mounted at /api/production
 */

const express = require("express");
const router = express.Router();
const { authenticate, requirePermission } = require("../middleware/auth");
const ctrl = require("../controllers/productionController");

// All routes require authentication
router.use(authenticate);

// ── Round Robin & Assignment ────────────────────────────────────────
router.get("/round-robin-state", requirePermission("production.view"), ctrl.getRoundRobinState);
router.get("/heads", requirePermission("production.assign_head"), ctrl.getProductionHeadsList);
router.get("/ready-for-assignment", requirePermission("production.assign_head"), ctrl.getReadyForAssignment);
router.post("/assign-head/:orderItemId", requirePermission("production.assign_head"), ctrl.assignProductionHead);

// ── Production Head Dashboard ───────────────────────────────────────
router.get("/my-assignments", requirePermission("production.view"), ctrl.getMyAssignments);
router.get("/order-item/:orderItemId/details", requirePermission("production.view"), ctrl.getOrderItemDetails);
router.get("/workers", requirePermission("production.assign_tasks"), ctrl.getWorkers);

// ── Task Management (per section) ───────────────────────────────────
router.post(
  "/order-item/:orderItemId/section/:sectionName/tasks",
  requirePermission("production.assign_tasks"),
  ctrl.createSectionTasks
);
router.get(
  "/order-item/:orderItemId/section/:sectionName/tasks",
  requirePermission("production.view"),
  ctrl.getSectionTasks
);
router.post(
  "/order-item/:orderItemId/section/:sectionName/start",
  requirePermission("production.manage"),
  ctrl.startSectionProduction
);

// ── Worker Tasks ────────────────────────────────────────────────────
router.get("/worker/my-tasks", requirePermission("production.view"), ctrl.getWorkerTasks);
router.post("/tasks/:taskId/start", requirePermission("production.start_task"), ctrl.startTask);
router.post("/tasks/:taskId/complete", requirePermission("production.complete_task"), ctrl.completeTask);
router.post("/tasks/:taskId/reassign", requirePermission("production.assign_tasks"), ctrl.reassignTask);

// ── Section Timeline & QA ───────────────────────────────────────────
router.get(
  "/order-item/:orderItemId/section/:sectionName/timeline",
  requirePermission("production.view"),
  ctrl.getSectionTimeline
);
router.post(
  "/order-item/:orderItemId/section/:sectionName/send-to-qa",
  requirePermission("production.send_to_qa"),
  ctrl.sendSectionToQA
);

module.exports = router;