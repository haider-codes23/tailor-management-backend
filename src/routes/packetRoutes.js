/**
 * Packet Routes
 *
 * Mounted at /api/packets in app.js
 *
 * GET  /api/packets              production.view           List all packets
 * GET  /api/packets/my-tasks     production.view           Packets assigned to current user
 * GET  /api/packets/check-queue  production.approve_packets Packets awaiting verification
 */

const { Router } = require("express");
const { authenticate, requirePermission } = require("../middleware/auth");
const ctrl = require("../controllers/packetController");

const router = Router();

// All routes require authentication
router.use(authenticate);

// IMPORTANT: /my-tasks and /check-queue must come BEFORE any /:id route
router.get(
  "/my-tasks",
  requirePermission("production.view"),
  ctrl.getMyTasks
);

router.get(
  "/check-queue",
  requirePermission("production.approve_packets"),
  ctrl.getCheckQueue
);

router.get(
  "/",
  requirePermission("production.view"),
  ctrl.listPackets
);

module.exports = router;