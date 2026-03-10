/**
 * Order Constants (Backend)
 *
 * Mirrors the frontend src/constants/orderConstants.js.
 * Single source of truth for all order-related enums used by
 * models, services, controllers, and validation schemas.
 */

// =========================================================================
// ORDER STATUS (order-level)
// =========================================================================

const ORDER_STATUS = {
  RECEIVED: "RECEIVED",
  INVENTORY_CHECK: "INVENTORY_CHECK",
  AWAITING_MATERIAL: "AWAITING_MATERIAL",
  CREATE_PACKET: "CREATE_PACKET",
  PACKET_CHECK: "PACKET_CHECK",
  READY_FOR_DYEING: "READY_FOR_DYEING",
  IN_DYEING: "IN_DYEING",
  READY_FOR_PRODUCTION: "READY_FOR_PRODUCTION",
  IN_PRODUCTION: "IN_PRODUCTION",
  PRODUCTION_COMPLETED: "PRODUCTION_COMPLETED",
  QUALITY_ASSURANCE: "QUALITY_ASSURANCE",
  READY_FOR_CLIENT_APPROVAL: "READY_FOR_CLIENT_APPROVAL",
  AWAITING_CLIENT_APPROVAL: "AWAITING_CLIENT_APPROVAL",
  AWAITING_ACCOUNT_APPROVAL: "AWAITING_ACCOUNT_APPROVAL",
  READY_FOR_DISPATCH: "READY_FOR_DISPATCH",
  DISPATCHED: "DISPATCHED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  CANCELLED_BY_CLIENT: "CANCELLED_BY_CLIENT",
};

const ORDER_STATUS_VALUES = Object.values(ORDER_STATUS);

// =========================================================================
// ORDER ITEM STATUS (item-level workflow)
// =========================================================================

const ORDER_ITEM_STATUS = {
  RECEIVED: "RECEIVED",
  AWAITING_CUSTOMER_FORM_APPROVAL: "AWAITING_CUSTOMER_FORM_APPROVAL",
  FABRICATION_BESPOKE: "FABRICATION_BESPOKE",
  INVENTORY_CHECK: "INVENTORY_CHECK",
  AWAITING_MATERIAL: "AWAITING_MATERIAL",
  CREATE_PACKET: "CREATE_PACKET",
  PARTIAL_CREATE_PACKET: "PARTIAL_CREATE_PACKET",
  PACKET_CHECK: "PACKET_CHECK",
  PARTIAL_PACKET_CHECK: "PARTIAL_PACKET_CHECK",
  READY_FOR_DYEING: "READY_FOR_DYEING",
  PARTIALLY_IN_DYEING: "PARTIALLY_IN_DYEING",
  IN_DYEING: "IN_DYEING",
  DYEING_COMPLETED: "DYEING_COMPLETED",
  READY_FOR_PRODUCTION: "READY_FOR_PRODUCTION",
  IN_PRODUCTION: "IN_PRODUCTION",
  PARTIAL_IN_PRODUCTION: "PARTIAL_IN_PRODUCTION",
  PRODUCTION_COMPLETED: "PRODUCTION_COMPLETED",
  QUALITY_ASSURANCE: "QUALITY_ASSURANCE",
  ALL_SECTIONS_QA_APPROVED: "ALL_SECTIONS_QA_APPROVED",
  VIDEO_UPLOADED: "VIDEO_UPLOADED",
  READY_FOR_CLIENT_APPROVAL: "READY_FOR_CLIENT_APPROVAL",
  AWAITING_CLIENT_APPROVAL: "AWAITING_CLIENT_APPROVAL",
  AWAITING_ACCOUNT_APPROVAL: "AWAITING_ACCOUNT_APPROVAL",
  CLIENT_APPROVED: "CLIENT_APPROVED",
  ALTERATION_REQUIRED: "ALTERATION_REQUIRED",
  REWORK_REQUIRED: "REWORK_REQUIRED",
  READY_FOR_DISPATCH: "READY_FOR_DISPATCH",
  DISPATCHED: "DISPATCHED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  CANCELLED_BY_CLIENT: "CANCELLED_BY_CLIENT",
};

const ORDER_ITEM_STATUS_VALUES = Object.values(ORDER_ITEM_STATUS);

// =========================================================================
// SECTION STATUS (per-section within an order item)
// =========================================================================

const SECTION_STATUS = {
  PENDING_INVENTORY_CHECK: "PENDING_INVENTORY_CHECK",
  INVENTORY_PASSED: "INVENTORY_PASSED",
  AWAITING_MATERIAL: "AWAITING_MATERIAL",
  PACKET_CREATED: "PACKET_CREATED",
  PACKET_VERIFIED: "PACKET_VERIFIED",
  PACKET_REJECTED: "PACKET_REJECTED",
  READY_FOR_DYEING: "READY_FOR_DYEING",
  DYEING_ACCEPTED: "DYEING_ACCEPTED",
  DYEING_IN_PROGRESS: "DYEING_IN_PROGRESS",
  DYEING_COMPLETED: "DYEING_COMPLETED",
  DYEING_REJECTED: "DYEING_REJECTED",
  READY_FOR_PRODUCTION: "READY_FOR_PRODUCTION",
  IN_PRODUCTION: "IN_PRODUCTION",
  PRODUCTION_COMPLETED: "PRODUCTION_COMPLETED",
  QA_PENDING: "QA_PENDING",
  QA_APPROVED: "QA_APPROVED",
  QA_REJECTED: "QA_REJECTED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
};

const SECTION_STATUS_VALUES = Object.values(SECTION_STATUS);

// =========================================================================
// ORDER SOURCE
// =========================================================================

const ORDER_SOURCE = {
  MANUAL: "MANUAL",
  SHOPIFY: "SHOPIFY",
};

const ORDER_SOURCE_VALUES = Object.values(ORDER_SOURCE);

// =========================================================================
// FULFILLMENT SOURCE
// =========================================================================

const FULFILLMENT_SOURCE = {
  READY_STOCK: "READY_STOCK",
  PRODUCTION: "PRODUCTION",
};

const FULFILLMENT_SOURCE_VALUES = Object.values(FULFILLMENT_SOURCE);

// =========================================================================
// SIZE TYPE
// =========================================================================

const SIZE_TYPE = {
  STANDARD: "STANDARD",
  CUSTOM: "CUSTOM",
};

const SIZE_TYPE_VALUES = Object.values(SIZE_TYPE);

// =========================================================================
// PAYMENT STATUS
// =========================================================================

const PAYMENT_STATUS = {
  PENDING: "PENDING",
  PARTIAL: "PARTIAL",
  PAID: "PAID",
};

const PAYMENT_STATUS_VALUES = Object.values(PAYMENT_STATUS);

// =========================================================================
// SECTION TYPE
// =========================================================================

const SECTION_TYPE = {
  MAIN: "MAIN",
  ADD_ON: "ADD_ON",
};

// =========================================================================
// SHOPIFY SYNC STATUS
// =========================================================================

const SHOPIFY_SYNC_STATUS = {
  SYNCED: "SYNCED",
  PENDING: "PENDING",
  FAILED: "FAILED",
  NOT_SYNCED: "NOT_SYNCED",
};

// =========================================================================
// ACTIVITY ACTION TYPES (for order_activities)
// =========================================================================

const ACTIVITY_ACTION_TYPE = {
  STATUS_CHANGE: "STATUS_CHANGE",
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_UPDATED: "ORDER_UPDATED",
  NOTE_ADDED: "NOTE_ADDED",
  INVENTORY_CHECK: "INVENTORY_CHECK",
  PACKET_EVENT: "PACKET_EVENT",
  DYEING_EVENT: "DYEING_EVENT",
  PRODUCTION: "PRODUCTION",
  QA: "QA",
  CLIENT_APPROVAL: "CLIENT_APPROVAL",
  DISPATCH: "DISPATCH",
  SHOPIFY_SYNC: "SHOPIFY_SYNC",
  PAYMENT: "PAYMENT",
  CUSTOMER_FORM: "CUSTOMER_FORM",
  FABRICATION: "FABRICATION",
};

// =========================================================================
// Exports
// =========================================================================

module.exports = {
  ORDER_STATUS,
  ORDER_STATUS_VALUES,
  ORDER_ITEM_STATUS,
  ORDER_ITEM_STATUS_VALUES,
  SECTION_STATUS,
  SECTION_STATUS_VALUES,
  ORDER_SOURCE,
  ORDER_SOURCE_VALUES,
  FULFILLMENT_SOURCE,
  FULFILLMENT_SOURCE_VALUES,
  SIZE_TYPE,
  SIZE_TYPE_VALUES,
  PAYMENT_STATUS,
  PAYMENT_STATUS_VALUES,
  SECTION_TYPE,
  SHOPIFY_SYNC_STATUS,
  ACTIVITY_ACTION_TYPE,
};