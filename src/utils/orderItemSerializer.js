/**
 * Order Item Serializer
 *
 * Converts snake_case DB fields to camelCase for the frontend.
 * Matches the exact response shape the MSW handlers return.
 */

/**
 * Serialize a single order item for API response.
 * @param {Object} item - Sequelize OrderItem instance (plain JSON)
 * @param {Object} [opts] - Options
 * @param {Array}  [opts.timeline] - Timeline entries from OrderActivity
 * @returns {Object} camelCase item object
 */
function serializeOrderItem(item, opts = {}) {
  if (!item) return null;

  const json = item.toJSON ? item.toJSON() : item;
  const timeline = opts.timeline || [];

  return {
    id: json.id,
    orderId: json.order_id,
    productId: json.product_id,
    productName: json.product_name,
    productSku: json.product_sku,
    productImage: json.product_image,
    quantity: json.quantity,
    unitPrice: parseFloat(json.unit_price) || 0,
    sizeType: json.size_type,
    size: json.size,
    heightRange: json.height_range,
    status: json.status,
    fulfillmentSource: json.fulfillment_source,
    bomId: json.bom_id,

    // Customisation — these are already JSONB, pass through
    style: json.style,
    color: json.color,
    fabric: json.fabric,

    // Measurements
    measurementCategories: json.measurement_categories || [],
    measurements: json.measurements || {},

    // Form tracking
    orderFormGenerated: json.order_form_generated || false,
    orderFormApproved: json.order_form_approved || false,
    orderForm: json.order_form || null,
    orderFormVersions: json.order_form_versions || [],
    garmentNotes: json.garment_notes || null,

    // What's included
    includedItems: json.included_items || [],
    selectedAddOns: json.selected_add_ons || [],

    // Section statuses
    sectionStatuses: json.section_statuses || {},

    // Custom BOM
    customBOM: json.custom_bom || null,

    // QA Video (Phase 13)
    videoData: json.video_data || null,
    reVideoRequest: json.re_video_request || null,
    modesty: json.modesty,
    notes: json.notes,

    // Sections (from association, if loaded)
    sections: json.sections
      ? json.sections.map(serializeSection)
      : undefined,

    // Timeline (from OrderActivity query)
    timeline,

    createdAt: json.created_at || json.createdAt,
    updatedAt: json.updated_at || json.updatedAt,
  };
}

/**
 * Serialize an OrderItemSection
 */
function serializeSection(section) {
  if (!section) return null;
  const json = section.toJSON ? section.toJSON() : section;

  return {
    id: json.id,
    orderItemId: json.order_item_id,
    piece: json.piece,
    type: json.type,
    status: json.status,
    statusUpdatedAt: json.status_updated_at,
    statusUpdatedBy: json.status_updated_by,
    createdAt: json.created_at || json.createdAt,
    updatedAt: json.updated_at || json.updatedAt,
  };
}

/**
 * Serialize a timeline entry from OrderActivity
 */
function serializeTimelineEntry(activity) {
  if (!activity) return null;
  const json = activity.toJSON ? activity.toJSON() : activity;

  return {
    id: json.id,
    action: json.action,
    user: json.performer ? json.performer.name : (json.performed_by || "System"),
    timestamp: json.created_at || json.createdAt,
    metadata: json.metadata,
  };
}

module.exports = {
  serializeOrderItem,
  serializeSection,
  serializeTimelineEntry,
};