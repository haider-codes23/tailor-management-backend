/**
 * Notification Routes — Phase 16
 *
 * Mounted at /api/notifications in app.js
 *
 * All endpoints require authentication. No special permission needed —
 * every user can manage their own notifications.
 *
 * GET    /api/notifications              Get current user's notifications (paginated)
 * GET    /api/notifications/unread-count  Get unread badge count
 * PUT    /api/notifications/read-all      Mark all as read
 * PUT    /api/notifications/:id/read      Mark single as read
 * DELETE /api/notifications/:id           Delete a notification
 */

const { Router } = require("express");
const { authenticate } = require("../middleware/auth");
const ctrl = require("../controllers/notificationController");

const router = Router();

// All routes require authentication (no special permissions)
router.use(authenticate);

// ─── List & count ─────────────────────────────────────────────────────

router.get("/", ctrl.getNotifications);
router.get("/unread-count", ctrl.getUnreadCount);

// ─── Mutations ────────────────────────────────────────────────────────

// read-all MUST come before /:id/read so Express doesn't treat "read-all" as an :id
router.put("/read-all", ctrl.markAllAsRead);
router.put("/:id/read", ctrl.markAsRead);

router.delete("/:id", ctrl.deleteNotification);

module.exports = router;