/**
 * Notification Controller — Phase 16
 *
 * Thin HTTP handlers delegating to notificationService.
 * All endpoints operate on the currently authenticated user's
 * notifications (user ID comes from req.user).
 */

const notificationService = require("../services/notificationService");

// ─── GET /api/notifications ──────────────────────────────────────────

async function getNotifications(req, res, next) {
  
  try {
    console.log("🔔 Notification request - user ID:", req.user.id, "type:", typeof req.user.id);
    const { page, limit, is_read, type } = req.query;
    const result = await notificationService.getNotifications(req.user.id, {
      page,
      limit,
      is_read,
      type,
    });
    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/notifications/unread-count ─────────────────────────────

async function getUnreadCount(req, res, next) {
  try {
    const count = await notificationService.getUnreadCount(req.user.id);
    return res.json({ success: true, data: { unreadCount: count } });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/notifications/:id/read ─────────────────────────────────

async function markAsRead(req, res, next) {
  try {
    const notification = await notificationService.markAsRead(
      req.params.id,
      req.user.id
    );
    return res.json({ success: true, data: notification });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/notifications/read-all ─────────────────────────────────

async function markAllAsRead(req, res, next) {
  try {
    const updatedCount = await notificationService.markAllAsRead(req.user.id);
    return res.json({ success: true, data: { updatedCount } });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/notifications/:id ───────────────────────────────────

async function deleteNotification(req, res, next) {
  try {
    const result = await notificationService.deleteNotification(
      req.params.id,
      req.user.id
    );
    return res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
};