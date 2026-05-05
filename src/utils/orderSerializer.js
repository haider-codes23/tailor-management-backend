/**
 * Order Serializer
 *
 * Transforms Sequelize snake_case order/item responses into the camelCase
 * format the frontend expects (matching the MSW ordersHandlers.js shape).
 */

// =========================================================================
// Generic snake_case → camelCase converter
// =========================================================================

function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Safely convert a value to a plain JSON-safe object first,
 * then convert keys to camelCase.  Handles Sequelize instances,
 * circular references, and deeply nested data.
 */
function camelCaseKeys(obj, depth = 0) {
  // Safety: prevent runaway recursion (no real order data is >10 levels deep)
  if (depth > 10) return obj;

  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;
  if (obj instanceof Date) return obj.toISOString();

  // If it's a Sequelize instance, flatten it first
  if (typeof obj.toJSON === "function" && obj.constructor && obj.constructor.name !== "Object" && obj.constructor.name !== "Array") {
    obj = obj.toJSON();
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => camelCaseKeys(item, depth + 1));
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = snakeToCamel(key);

    // Skip Sequelize internal fields that shouldn't be serialized
    if (key.startsWith("_") || key === "dataValues" || key === "isNewRecord" || key === "sequelize") {
      continue;
    }

    // JSONB fields — preserve internal structure as-is (don't recurse into their keys)
    const jsonbFields = [
      "style", "color", "fabric", "measurements",
      "section_statuses", "sectionStatuses",
      "custom_bom", "customBom",
      "tags",
      "product_items", "productItems",
      "add_ons", "addOns",
      "included_items", "includedItems",
      "selected_add_ons", "selectedAddOns",
      "enabled_size_fields", "enabledSizeFields",
      "enabled_height_fields", "enabledHeightFields",
      "images",
      "order_form", "orderForm",
      "order_form_versions", "orderFormVersions",
      "garment_notes", "garmentNotes",
      "measurement_categories", "measurementCategories",
      "shipping_address", "shippingAddress",
    ];

    if (jsonbFields.includes(key) || jsonbFields.includes(camelKey)) {
      result[camelKey] = value;
    } else if (value === null || value === undefined) {
      result[camelKey] = value;
    } else if (typeof value === "object") {
      result[camelKey] = camelCaseKeys(value, depth + 1);
    } else {
      result[camelKey] = value;
    }
  }
  return result;
}

// =========================================================================
// Order Serializer
// =========================================================================

/**
 * Serialize a single order to the frontend camelCase format.
 */
function serializeOrder(order) {
  if (!order) return null;

  // Force to a completely plain object — strips Sequelize getters, prototypes, circular refs
  const plain = JSON.parse(JSON.stringify(
    typeof order.toJSON === "function" ? order.toJSON() : order
  ));
  const serialized = camelCaseKeys(plain);

  // Ensure items array and itemCount
  if (serialized.items && Array.isArray(serialized.items)) {
    serialized.itemCount = serialized.items.length;
  }

  // Ensure statusSummary for list/detail views
  if (serialized.items && !serialized.statusSummary) {
    const counts = {};
    serialized.items.forEach((item) => {
      const s = item.status || "RECEIVED";
      counts[s] = (counts[s] || 0) + 1;
    });
    serialized.statusSummary = { counts, total: serialized.items.length };
  }

  return serialized;
}

/**
 * Serialize a single order item.
 */
function serializeOrderItem(item) {
  if (!item) return null;
  const plain = JSON.parse(JSON.stringify(
    typeof item.toJSON === "function" ? item.toJSON() : item
  ));
  return camelCaseKeys(plain);
}

/**
 * Serialize order list response (array of orders).
 */
function serializeOrderList(orders) {
  if (!Array.isArray(orders)) return [];
  return orders.map(serializeOrder);
}

module.exports = {
  camelCaseKeys,
  serializeOrder,
  serializeOrderItem,
  serializeOrderList,
};