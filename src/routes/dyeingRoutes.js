/**
 * Dyeing Routes — Phase 11
 * Mounted at /api/dyeing
 */

const express = require("express");
const router = express.Router();
const { authenticate, requirePermission } = require("../middleware/auth");
const dyeingCtrl = require("../controllers/dyeingController");

// All routes require authentication
router.use(authenticate);

// ── Queries ───────────────────────────────────────────────────────────

// GET /api/dyeing/available-tasks
router.get(
  "/available-tasks",
  requirePermission("dyeing.view"),
  dyeingCtrl.getAvailableTasks
);

// GET /api/dyeing/my-tasks?userId=xxx
router.get(
  "/my-tasks",
  requirePermission("dyeing.view"),
  dyeingCtrl.getMyTasks
);

// GET /api/dyeing/completed-tasks
router.get(
  "/completed-tasks",
  requirePermission("dyeing.view"),
  dyeingCtrl.getCompletedTasks
);

// GET /api/dyeing/stats
router.get(
  "/stats",
  requirePermission("dyeing.view"),
  dyeingCtrl.getStats
);

// GET /api/dyeing/task/:orderItemId
router.get(
  "/task/:orderItemId",
  requirePermission("dyeing.view"),
  dyeingCtrl.getTaskDetails
);

// ── Mutations ─────────────────────────────────────────────────────────

// POST /api/dyeing/task/:orderItemId/accept
router.post(
  "/task/:orderItemId/accept",
  requirePermission("dyeing.accept"),
  dyeingCtrl.acceptSections
);

// POST /api/dyeing/task/:orderItemId/start
router.post(
  "/task/:orderItemId/start",
  requirePermission("dyeing.start"),
  dyeingCtrl.startDyeing
);

// POST /api/dyeing/task/:orderItemId/complete
router.post(
  "/task/:orderItemId/complete",
  requirePermission("dyeing.complete"),
  dyeingCtrl.completeDyeing
);

// POST /api/dyeing/task/:orderItemId/reject
router.post(
  "/task/:orderItemId/reject",
  requirePermission("dyeing.accept"),
  dyeingCtrl.rejectSections
);

module.exports = router;