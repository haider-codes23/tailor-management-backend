/**
 * Notification Type Constants — Phase 16
 *
 * Centralized type strings for all notification events.
 * Used by notificationService and referenced by the frontend
 * for icon/color mapping.
 */

const NOTIFICATION_TYPES = {
  // ── Order lifecycle ──────────────────────────────────────────────
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_UPDATED: "ORDER_UPDATED",
  ORDER_CANCELLED: "ORDER_CANCELLED",

  // ── Inventory / Procurement ──────────────────────────────────────
  INVENTORY_CHECK_NEEDED: "INVENTORY_CHECK_NEEDED",
  MATERIAL_SHORTAGE: "MATERIAL_SHORTAGE",
  LOW_STOCK: "LOW_STOCK",

  // ── Packet workflow ──────────────────────────────────────────────
  PACKET_ASSIGNED: "PACKET_ASSIGNED",
  PACKET_COMPLETED: "PACKET_COMPLETED",
  PACKET_REJECTED: "PACKET_REJECTED",

  // ── Production ───────────────────────────────────────────────────
  PRODUCTION_ASSIGNED: "PRODUCTION_ASSIGNED",
  TASK_ASSIGNED: "TASK_ASSIGNED",
  SECTION_SENT_TO_QA: "SECTION_SENT_TO_QA",
  PRODUCTION_COMPLETED: "PRODUCTION_COMPLETED",

  // ── QA ───────────────────────────────────────────────────────────
  QA_REVIEW_NEEDED: "QA_REVIEW_NEEDED",
  QA_APPROVED: "QA_APPROVED",
  QA_REJECTED: "QA_REJECTED",

  // ── Sales / Client approval ──────────────────────────────────────
  CLIENT_APPROVAL_NEEDED: "CLIENT_APPROVAL_NEEDED",
  CLIENT_APPROVED: "CLIENT_APPROVED",
  REWORK_NEEDED: "REWORK_NEEDED",
  RE_VIDEO_REQUESTED: "RE_VIDEO_REQUESTED",
  ALTERATION_REQUESTED: "ALTERATION_REQUESTED",

  // ── Dispatch ─────────────────────────────────────────────────────
  READY_FOR_DISPATCH: "READY_FOR_DISPATCH",
  ORDER_DISPATCHED: "ORDER_DISPATCHED",

  /// ── Dyeing ───────────────────────────────────────────────────────
  DYEING_REQUIRED: "DYEING_REQUIRED",
  DYEING_ACCEPTED: "DYEING_ACCEPTED",
  DYEING_STARTED: "DYEING_STARTED",
  DYEING_COMPLETED: "DYEING_COMPLETED",
  DYEING_REJECTED: "DYEING_REJECTED",
};

/**
 * Reference types — the entity a notification links to
 */
const REFERENCE_TYPES = {
  ORDER: "ORDER",
  ORDER_ITEM: "ORDER_ITEM",
  PACKET: "PACKET",
  PRODUCTION_TASK: "PRODUCTION_TASK",
  INVENTORY: "INVENTORY",
};

module.exports = { NOTIFICATION_TYPES, REFERENCE_TYPES };