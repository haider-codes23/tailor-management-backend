/**
 * Inventory Constants
 *
 * Shared constants used across inventory models, services, and validators.
 * Centralised here to avoid duplication and ensure consistency.
 */

const INVENTORY_CATEGORIES = [
  "FABRIC",
  "RAW_MATERIAL",
  "MULTI_HEAD",
  "ADDA_MATERIAL",
  "READY_STOCK",
  "READY_SAMPLE",
];

const MOVEMENT_TYPES = [
  "STOCK_IN",
  "STOCK_OUT",
  "RESERVED",
  "ADJUSTMENT",
  "ISSUE_READY_STOCK_TO_ORDER",
  "RETURN_READY_STOCK",
];

module.exports = {
  INVENTORY_CATEGORIES,
  MOVEMENT_TYPES,
};