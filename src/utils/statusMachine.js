/**
 * Status Machine
 *
 * Validates that a status transition is allowed before it happens.
 * Used by orderService, inventoryCheckService, productionService, etc.
 *
 * Mirrors the VALID_TRANSITIONS map from the frontend ordersHandlers.js
 * and the backend plan (Phase 8I).
 *
 * Key design:
 *   - RECEIVED has TWO exit paths depending on ready stock check:
 *       Ready Stock  → AWAITING_CLIENT_APPROVAL (skips production)
 *       Production   → INVENTORY_CHECK / AWAITING_CUSTOMER_FORM_APPROVAL / FABRICATION_BESPOKE
 *   - Every transition is explicitly listed; anything not listed is rejected.
 *   - Terminal statuses (COMPLETED, CANCELLED, CANCELLED_BY_CLIENT) have no exits.
 */

const { ORDER_ITEM_STATUS } = require("../constants/order");

// =========================================================================
// Order Item Status Transitions
// =========================================================================

const ORDER_ITEM_TRANSITIONS = {
  // ── Entry ─────────────────────────────────────────────────────────
  // Ready Stock path: RECEIVED → AWAITING_CLIENT_APPROVAL
  // Production path:  RECEIVED → INVENTORY_CHECK / AWAITING_CUSTOMER_FORM_APPROVAL / FABRICATION_BESPOKE
  [ORDER_ITEM_STATUS.RECEIVED]: [
    ORDER_ITEM_STATUS.AWAITING_CLIENT_APPROVAL,       // ready stock shortcut
    ORDER_ITEM_STATUS.AWAITING_CUSTOMER_FORM_APPROVAL, // standard form flow
    ORDER_ITEM_STATUS.FABRICATION_BESPOKE,             // custom size → needs custom BOM
    ORDER_ITEM_STATUS.INVENTORY_CHECK,                 // direct to inventory check
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  // ── Customer Form ─────────────────────────────────────────────────
  [ORDER_ITEM_STATUS.AWAITING_CUSTOMER_FORM_APPROVAL]: [
    ORDER_ITEM_STATUS.INVENTORY_CHECK,
    ORDER_ITEM_STATUS.AWAITING_CUSTOMER_FORM_APPROVAL, // re-generate / new version
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  // ── Fabrication Bespoke ───────────────────────────────────────────
  [ORDER_ITEM_STATUS.FABRICATION_BESPOKE]: [
    ORDER_ITEM_STATUS.INVENTORY_CHECK,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  // ── Inventory ─────────────────────────────────────────────────────
  [ORDER_ITEM_STATUS.INVENTORY_CHECK]: [
    ORDER_ITEM_STATUS.CREATE_PACKET,
    ORDER_ITEM_STATUS.PARTIAL_CREATE_PACKET,
    ORDER_ITEM_STATUS.AWAITING_MATERIAL,
    ORDER_ITEM_STATUS.READY_FOR_PRODUCTION,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  [ORDER_ITEM_STATUS.AWAITING_MATERIAL]: [
    ORDER_ITEM_STATUS.INVENTORY_CHECK, // re-run after stock-in
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  // ── Packet ────────────────────────────────────────────────────────
  [ORDER_ITEM_STATUS.CREATE_PACKET]: [
    ORDER_ITEM_STATUS.PACKET_CHECK,
    ORDER_ITEM_STATUS.PARTIAL_CREATE_PACKET,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  [ORDER_ITEM_STATUS.PARTIAL_CREATE_PACKET]: [
    ORDER_ITEM_STATUS.CREATE_PACKET,
    ORDER_ITEM_STATUS.PACKET_CHECK,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  [ORDER_ITEM_STATUS.PACKET_CHECK]: [
    ORDER_ITEM_STATUS.READY_FOR_DYEING,
    ORDER_ITEM_STATUS.READY_FOR_PRODUCTION,
    ORDER_ITEM_STATUS.CREATE_PACKET, // rejected → redo
    ORDER_ITEM_STATUS.PARTIAL_PACKET_CHECK,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  [ORDER_ITEM_STATUS.PARTIAL_PACKET_CHECK]: [
    ORDER_ITEM_STATUS.PACKET_CHECK,
    ORDER_ITEM_STATUS.READY_FOR_DYEING,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  // ── Dyeing ────────────────────────────────────────────────────────
  [ORDER_ITEM_STATUS.READY_FOR_DYEING]: [
    ORDER_ITEM_STATUS.IN_DYEING,
    ORDER_ITEM_STATUS.PARTIALLY_IN_DYEING,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  [ORDER_ITEM_STATUS.PARTIALLY_IN_DYEING]: [
    ORDER_ITEM_STATUS.IN_DYEING,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  [ORDER_ITEM_STATUS.IN_DYEING]: [
    ORDER_ITEM_STATUS.DYEING_COMPLETED,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  [ORDER_ITEM_STATUS.DYEING_COMPLETED]: [
    ORDER_ITEM_STATUS.READY_FOR_PRODUCTION,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  // ── Production ────────────────────────────────────────────────────
  [ORDER_ITEM_STATUS.READY_FOR_PRODUCTION]: [
    ORDER_ITEM_STATUS.IN_PRODUCTION,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  [ORDER_ITEM_STATUS.IN_PRODUCTION]: [
    ORDER_ITEM_STATUS.PARTIAL_IN_PRODUCTION,
    ORDER_ITEM_STATUS.PRODUCTION_COMPLETED,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  [ORDER_ITEM_STATUS.PARTIAL_IN_PRODUCTION]: [
    ORDER_ITEM_STATUS.IN_PRODUCTION,
    ORDER_ITEM_STATUS.PRODUCTION_COMPLETED,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  [ORDER_ITEM_STATUS.PRODUCTION_COMPLETED]: [
    ORDER_ITEM_STATUS.QUALITY_ASSURANCE,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  // ── QA ────────────────────────────────────────────────────────────
  [ORDER_ITEM_STATUS.QUALITY_ASSURANCE]: [
    ORDER_ITEM_STATUS.ALL_SECTIONS_QA_APPROVED,
    ORDER_ITEM_STATUS.IN_PRODUCTION, // QA rejected → back to production
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  [ORDER_ITEM_STATUS.ALL_SECTIONS_QA_APPROVED]: [
    ORDER_ITEM_STATUS.VIDEO_UPLOADED,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  [ORDER_ITEM_STATUS.VIDEO_UPLOADED]: [
    ORDER_ITEM_STATUS.READY_FOR_CLIENT_APPROVAL,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  // ── Client Approval ───────────────────────────────────────────────
  [ORDER_ITEM_STATUS.READY_FOR_CLIENT_APPROVAL]: [
    ORDER_ITEM_STATUS.AWAITING_CLIENT_APPROVAL,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  [ORDER_ITEM_STATUS.AWAITING_CLIENT_APPROVAL]: [
    ORDER_ITEM_STATUS.CLIENT_APPROVED,
    ORDER_ITEM_STATUS.REWORK_REQUIRED,
    ORDER_ITEM_STATUS.ALTERATION_REQUIRED,
    ORDER_ITEM_STATUS.CANCELLED,
    ORDER_ITEM_STATUS.CANCELLED_BY_CLIENT,
  ],

  [ORDER_ITEM_STATUS.AWAITING_ACCOUNT_APPROVAL]: [
    ORDER_ITEM_STATUS.READY_FOR_DISPATCH,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  [ORDER_ITEM_STATUS.CLIENT_APPROVED]: [
    ORDER_ITEM_STATUS.AWAITING_ACCOUNT_APPROVAL,
    ORDER_ITEM_STATUS.READY_FOR_DISPATCH,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  // ── Rework / Alteration loops ─────────────────────────────────────
  [ORDER_ITEM_STATUS.REWORK_REQUIRED]: [
    ORDER_ITEM_STATUS.INVENTORY_CHECK,
    ORDER_ITEM_STATUS.READY_FOR_PRODUCTION,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  [ORDER_ITEM_STATUS.ALTERATION_REQUIRED]: [
    ORDER_ITEM_STATUS.IN_PRODUCTION,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  // ── Dispatch & Completion ─────────────────────────────────────────
  [ORDER_ITEM_STATUS.READY_FOR_DISPATCH]: [
    ORDER_ITEM_STATUS.DISPATCHED,
    ORDER_ITEM_STATUS.CANCELLED,
  ],

  [ORDER_ITEM_STATUS.DISPATCHED]: [
    ORDER_ITEM_STATUS.COMPLETED,
  ],

  // ── Terminal statuses — no exits ──────────────────────────────────
  [ORDER_ITEM_STATUS.COMPLETED]: [],
  [ORDER_ITEM_STATUS.CANCELLED]: [],
  [ORDER_ITEM_STATUS.CANCELLED_BY_CLIENT]: [],
};

// =========================================================================
// Public API
// =========================================================================

/**
 * Check whether a transition from `currentStatus` to `nextStatus` is valid.
 *
 * @param {string} currentStatus
 * @param {string} nextStatus
 * @returns {boolean}
 */
function canTransition(currentStatus, nextStatus) {
  const allowed = ORDER_ITEM_TRANSITIONS[currentStatus];
  if (!allowed) return false;
  return allowed.includes(nextStatus);
}

/**
 * Assert that a transition is valid; throw if not.
 *
 * @param {string} currentStatus
 * @param {string} nextStatus
 * @throws {Error} with status 400
 */
function assertTransition(currentStatus, nextStatus) {
  if (!canTransition(currentStatus, nextStatus)) {
    const allowed = ORDER_ITEM_TRANSITIONS[currentStatus] || [];
    const err = new Error(
      `Invalid status transition: ${currentStatus} → ${nextStatus}. ` +
      `Allowed transitions from ${currentStatus}: [${allowed.join(", ")}]`
    );
    err.status = 400;
    err.code = "INVALID_STATUS_TRANSITION";
    throw err;
  }
}

/**
 * Get all allowed next statuses for a given current status.
 *
 * @param {string} currentStatus
 * @returns {string[]}
 */
function getAllowedTransitions(currentStatus) {
  return ORDER_ITEM_TRANSITIONS[currentStatus] || [];
}

/**
 * Check if a status is terminal (no further transitions).
 *
 * @param {string} status
 * @returns {boolean}
 */
function isTerminal(status) {
  const allowed = ORDER_ITEM_TRANSITIONS[status];
  return Array.isArray(allowed) && allowed.length === 0;
}

module.exports = {
  ORDER_ITEM_TRANSITIONS,
  canTransition,
  assertTransition,
  getAllowedTransitions,
  isTerminal,
};