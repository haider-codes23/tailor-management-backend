/**
 * Notification Service — Phase 16
 *
 * Core CRUD for notifications + helper functions to create
 * notifications for specific users or all users with a given role.
 *
 * Other services call notifyUser / notifyRole / notifyUsers to
 * create notifications when workflow events occur.
 */

const { Op } = require("sequelize");
const { User, Notification } = require("../models");
const { getIO } = require("../config/socketManager");

const serviceError = (msg, status, code) => {
  const e = new Error(msg);
  e.status = status;
  e.code = code;
  return e;
};

/**
 * Emit a real-time notification to a user via Socket.IO.
 * Sends the full notification object + updated unread count.
 * Silently skipped if Socket.IO is not initialized.
 */
async function emitToUser(userId, notification) {
  try {
    const io = getIO();
    if (!io) return;

    // Get updated unread count for this user
    const unreadCount = await Notification.count({
      where: { user_id: userId, is_read: false },
    });

    io.to(userId).emit("notification", {
      notification: notification.toJSON ? notification.toJSON() : notification,
      unreadCount,
    });
  } catch (err) {
    // Socket errors should never break the main flow
    console.error(`⚠️ Socket emit failed for user ${userId}:`, err.message);
  }
}

// =========================================================================
// CRUD — called by the controller
// =========================================================================

/**
 * Get paginated notifications for a user.
 *
 * @param {string} userId
 * @param {Object} opts - { page, limit, is_read, type }
 */
async function getNotifications(userId, { page = 1, limit = 20, is_read, type } = {}) {
  const where = { user_id: userId };

  if (is_read !== undefined && is_read !== null) {
    where.is_read = is_read === "true" || is_read === true;
  }

  if (type) {
    where.type = type;
  }

  const offset = (page - 1) * limit;

  const { count, rows } = await Notification.findAndCountAll({
    where,
    order: [["created_at", "DESC"]],
    limit: parseInt(limit, 10),
    offset,
  });

  return {
    notifications: rows,
    total: count,
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    totalPages: Math.ceil(count / limit),
  };
}

/**
 * Get unread count for the bell badge.
 *
 * @param {string} userId
 * @returns {Promise<number>}
 */
async function getUnreadCount(userId) {
  return Notification.count({
    where: { user_id: userId, is_read: false },
  });
}

/**
 * Mark a single notification as read.
 *
 * @param {string} notificationId
 * @param {string} userId - ensures ownership
 */
async function markAsRead(notificationId, userId) {
  const notification = await Notification.findOne({
    where: { id: notificationId, user_id: userId },
  });

  if (!notification) {
    throw serviceError("Notification not found", 404, "NOTIFICATION_NOT_FOUND");
  }

  await notification.update({ is_read: true });
  return notification;
}

/**
 * Mark ALL unread notifications as read for a user.
 *
 * @param {string} userId
 * @returns {Promise<number>} count of updated rows
 */
async function markAllAsRead(userId) {
  const [updatedCount] = await Notification.update(
    { is_read: true },
    { where: { user_id: userId, is_read: false } }
  );
  return updatedCount;
}

/**
 * Delete a single notification.
 *
 * @param {string} notificationId
 * @param {string} userId - ensures ownership
 */
async function deleteNotification(notificationId, userId) {
  const notification = await Notification.findOne({
    where: { id: notificationId, user_id: userId },
  });

  if (!notification) {
    throw serviceError("Notification not found", 404, "NOTIFICATION_NOT_FOUND");
  }

  await notification.destroy();
  return { deleted: true };
}

// =========================================================================
// CREATION HELPERS — called by other services
// =========================================================================

/**
 * Send a notification to a single user.
 *
 * @param {string} userId
 * @param {Object} data - { type, title, message, referenceType, referenceId, actionUrl, metadata }
 * @returns {Promise<Notification>}
 */
async function notifyUser(userId, data) {
  try {
    const notification = await Notification.create({
      user_id: userId,
      type: data.type,
      title: data.title,
      message: data.message,
      reference_type: data.referenceType || null,
      reference_id: data.referenceId || null,
      action_url: data.actionUrl || null,
      metadata: data.metadata || null,
    });

    // Push real-time via Socket.IO
    emitToUser(userId, notification);

    return notification;
  } catch (err) {
    // Notification failures should never break the main workflow
    console.error(`⚠️ Failed to create notification for user ${userId}:`, err.message);
    return null;
  }
}

/**
 * Send a notification to multiple users at once.
 *
 * @param {string[]} userIds
 * @param {Object} data - same shape as notifyUser
 * @returns {Promise<Notification[]>}
 */
async function notifyUsers(userIds, data) {
  if (!userIds || userIds.length === 0) return [];

  const uniqueIds = [...new Set(userIds)];
  const records = uniqueIds.map((uid) => ({
    user_id: uid,
    type: data.type,
    title: data.title,
    message: data.message,
    reference_type: data.referenceType || null,
    reference_id: data.referenceId || null,
    action_url: data.actionUrl || null,
    metadata: data.metadata || null,
  }));

  try {
    const notifications = await Notification.bulkCreate(records);

    // Push real-time via Socket.IO to each user
    notifications.forEach((notif, i) => {
      emitToUser(uniqueIds[i], notif);
    });

    return notifications;
  } catch (err) {
    console.error(`⚠️ Failed to bulk-create notifications:`, err.message);
    return [];
  }
}

/**
 * Send a notification to ALL active users with a given role.
 *
 * @param {string} role - e.g. "ADMIN", "PURCHASER", "QA"
 * @param {Object} data - same shape as notifyUser
 * @returns {Promise<Notification[]>}
 */
async function notifyRole(role, data) {
  try {
    const users = await User.findAll({
      where: { role, is_active: true },
      attributes: ["id"],
    });

    const userIds = users.map((u) => u.id);
    if (userIds.length === 0) return [];

    return notifyUsers(userIds, data);
  } catch (err) {
    console.error(`⚠️ Failed to notify role ${role}:`, err.message);
    return [];
  }
}

/**
 * Send a notification to all active users with ANY of the given roles.
 *
 * @param {string[]} roles - e.g. ["ADMIN", "SALES"]
 * @param {Object} data
 * @returns {Promise<Notification[]>}
 */
async function notifyRoles(roles, data) {
  try {
    const users = await User.findAll({
      where: { role: { [Op.in]: roles }, is_active: true },
      attributes: ["id"],
    });

    const userIds = users.map((u) => u.id);
    if (userIds.length === 0) return [];

    return notifyUsers(userIds, data);
  } catch (err) {
    console.error(`⚠️ Failed to notify roles ${roles.join(",")}:`, err.message);
    return [];
  }
}

// =========================================================================
// Exports
// =========================================================================

module.exports = {
  // CRUD (controller)
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,

  // Creation helpers (other services)
  notifyUser,
  notifyUsers,
  notifyRole,
  notifyRoles,
};