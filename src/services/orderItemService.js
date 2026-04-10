/**
 * Order Item Service
 *
 * Business logic for order item CRUD, customer form generation/approval,
 * timeline entries, and adding/deleting items from orders.
 *
 * Phase 8D endpoints:
 *   GET    /order-items/:id
 *   PUT    /order-items/:id
 *   DELETE /order-items/:id
 *   POST   /orders/:orderId/items
 *   POST   /order-items/:id/timeline
 *   POST   /order-items/:id/generate-form
 *   POST   /order-items/:id/approve-form
 */

const {
  Order,
  OrderItem,
  OrderItemSection,
  OrderActivity,
  Product,
  Bom,
  BomItem,
  sequelize,
} = require("../models");

const { ORDER_ITEM_STATUS, SIZE_TYPE, SECTION_TYPE } = require("../constants/order");
const { serializeTimelineEntry } = require("../utils/orderItemSerializer");

// ─── Helpers ──────────────────────────────────────────────────────────

function serviceError(message, status = 400, code = "ORDER_ITEM_ERROR") {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

// ─── GET order item by ID ─────────────────────────────────────────────

async function getOrderItemById(itemId) {
  const item = await OrderItem.findByPk(itemId, {
    include: [
      {
        model: OrderItemSection,
        as: "sections",
        order: [["created_at", "ASC"]],
      },
    ],
  });

  if (!item) {
    throw serviceError("Order item not found", 404, "ORDER_ITEM_NOT_FOUND");
  }

  // Fetch timeline from OrderActivity
  const activities = await OrderActivity.findAll({
    where: { order_item_id: itemId },
    include: [
      {
        model: require("../models").User,
        as: "performer",
        attributes: ["id", "name"],
        required: false,
      },
    ],
    order: [["created_at", "ASC"]],
  });

  const timeline = activities.map(serializeTimelineEntry);

  return { item, timeline };
}

// ─── UPDATE order item ────────────────────────────────────────────────

async function updateOrderItem(itemId, data, user) {
  const item = await OrderItem.findByPk(itemId);
  if (!item) {
    throw serviceError("Order item not found", 404, "ORDER_ITEM_NOT_FOUND");
  }

  // Whitelist of directly editable fields
  const updateFields = {};
  const allowedFields = [
    "status", "style", "color", "fabric", "modesty", "notes",
    "measurements", "measurement_categories", "height_range",
    "size", "size_type", "quantity", "unit_price",
    "garment_notes", "section_statuses",
  ];

  // Accept both camelCase and snake_case from frontend
  const fieldMap = {
    sizeType: "size_type",
    unitPrice: "unit_price",
    heightRange: "height_range",
    measurementCategories: "measurement_categories",
    garmentNotes: "garment_notes",
    sectionStatuses: "section_statuses",
  };

  for (const [key, val] of Object.entries(data)) {
    const dbKey = fieldMap[key] || key;
    if (allowedFields.includes(dbKey) && val !== undefined) {
      updateFields[dbKey] = val;
    }
  }

  if (Object.keys(updateFields).length === 0) {
    throw serviceError("No valid fields to update", 400, "NO_FIELDS");
  }

  await item.update(updateFields);

  // Log activity if status changed
  if (updateFields.status && updateFields.status !== item.previous("status")) {
    await OrderActivity.log({
      orderId: item.order_id,
      orderItemId: item.id,
      action: `Item status changed to ${updateFields.status}`,
      actionType: "STATUS_CHANGE",
      userId: user?.id || null,
      userName: user?.name || null,
      details: {
        old_status: item.previous("status"),
        new_status: updateFields.status,
      },
    });
  }

  // Re-fetch with sections
  return getOrderItemById(itemId);
}

// ─── DELETE order item ────────────────────────────────────────────────

async function deleteOrderItem(itemId) {
  const item = await OrderItem.findByPk(itemId);
  if (!item) {
    throw serviceError("Order item not found", 404, "ORDER_ITEM_NOT_FOUND");
  }

  const orderId = item.order_id;

  await sequelize.transaction(async (t) => {
    // Delete sections first
    await OrderItemSection.destroy({
      where: { order_item_id: itemId },
      transaction: t,
    });

    // Delete activities for this item
    await OrderActivity.destroy({
      where: { order_item_id: itemId },
      transaction: t,
    });

    // Delete the item
    await item.destroy({ transaction: t });

    // Update order's updated_at
    await Order.update(
      { updated_at: new Date() },
      { where: { id: orderId }, transaction: t }
    );
  });

  return { success: true };
}

// ─── ADD item to existing order ───────────────────────────────────────

async function addOrderItem(orderId, data, user) {
  const order = await Order.findByPk(orderId);
  if (!order) {
    throw serviceError("Order not found", 404, "ORDER_NOT_FOUND");
  }

  // Accept camelCase from frontend
  const productId = data.productId || data.product_id;
  const productName = data.productName || data.product_name;
  const productSku = data.productSku || data.product_sku;
  const productImage = data.productImage || data.product_image;
  const sizeType = data.sizeType || data.size_type || SIZE_TYPE.STANDARD;
  const includedItems = data.includedItems || data.included_items || [];
  const selectedAddOns = data.selectedAddOns || data.selected_add_ons || [];
  const unitPrice = data.unitPrice || data.unit_price || 0;

  const result = await sequelize.transaction(async (t) => {
    // Look up active BOM for the product
    let bomId = null;
    if (productId) {
      const activeBom = await Bom.findOne({
        where: { product_id: productId, is_active: true },
        transaction: t,
      });
      if (activeBom) bomId = activeBom.id;
    }

    // Create the order item
    const newItem = await OrderItem.create(
      {
        order_id: orderId,
        product_id: productId || null,
        product_name: productName,
        product_sku: productSku || null,
        product_image: productImage || null,
        quantity: data.quantity || 1,
        unit_price: unitPrice,
        size_type: sizeType,
        size: data.size || null,
        status: ORDER_ITEM_STATUS.RECEIVED,
        fulfillment_source: null,
        bom_id: bomId,
        included_items: includedItems,
        selected_add_ons: selectedAddOns,
        style: { type: "original", details: {}, attachments: [], image: null },
        color: { type: "original", details: "", attachments: [], image: null },
        fabric: { type: "original", details: "", attachments: [], image: null },
      },
      { transaction: t }
    );

    // Create sections from included items + add-ons
    const sectionRecords = [];
    includedItems.forEach((inc) => {
      sectionRecords.push({
        order_item_id: newItem.id,
        piece: inc.piece,
        type: SECTION_TYPE.MAIN,
        status: ORDER_ITEM_STATUS.RECEIVED,
      });
    });
    selectedAddOns.forEach((addon) => {
      sectionRecords.push({
        order_item_id: newItem.id,
        piece: addon.piece,
        type: SECTION_TYPE.ADD_ON,
        status: ORDER_ITEM_STATUS.RECEIVED,
      });
    });

    if (sectionRecords.length > 0) {
      await OrderItemSection.bulkCreate(sectionRecords, { transaction: t });
    }

    // Build initial section_statuses JSONB
    const sectionStatuses = {};
    sectionRecords.forEach((s) => {
      sectionStatuses[s.piece.toLowerCase()] = {
        status: ORDER_ITEM_STATUS.RECEIVED,
        updatedAt: new Date().toISOString(),
      };
    });
    await newItem.update({ section_statuses: sectionStatuses }, { transaction: t });

    // Log activity
    await OrderActivity.log({
      orderId: orderId,
      orderItemId: newItem.id,
      action: `Order item added: ${productName}`,
      actionType: "ITEM_ADDED",
      userId: user?.id || null,
      userName: user?.name || null,
      transaction: t,
    });

    // Update order timestamp
    await Order.update(
      { updated_at: new Date() },
      { where: { id: orderId }, transaction: t }
    );

    return newItem;
  });

  return getOrderItemById(result.id);
}

// ─── ADD timeline entry ───────────────────────────────────────────────

async function addTimelineEntry(itemId, data, user) {
  const item = await OrderItem.findByPk(itemId);
  if (!item) {
    throw serviceError("Order item not found", 404, "ORDER_ITEM_NOT_FOUND");
  }

  const activity = await OrderActivity.log({
    orderId: item.order_id,
    orderItemId: itemId,
    action: data.action || data.description || "Timeline entry added",
    actionType: "NOTE_ADDED",
    userId: user?.id || null,
    userName: user?.name || null,
    details: data.metadata || null,
  });

  return serializeTimelineEntry(activity);
}

// ─── GENERATE customer form ───────────────────────────────────────────

async function generateForm(itemId, data, user) {
  const item = await OrderItem.findByPk(itemId);
  if (!item) {
    throw serviceError("Order item not found", 404, "ORDER_ITEM_NOT_FOUND");
  }

  const now = new Date().toISOString();
  const versionId = `form-v-${Date.now()}`;
  const generatedBy = data.generatedBy || user?.name || "System";
  const isEditMode = data.isEditMode || false;

  // Build the form version object
  const newFormVersion = {
    versionId,
    generatedAt: now,
    generatedBy,
    ...data,
    includedItems: item.included_items || [],
    selectedAddOns: item.selected_add_ons || [],
  };

  // Get existing versions
  const existingVersions = item.order_form_versions || [];
  const updatedVersions = isEditMode
    ? [...existingVersions, newFormVersion]
    : [newFormVersion];

  // Build update payload
  const updateFields = {
    order_form_generated: true,
    order_form: newFormVersion,
    order_form_versions: updatedVersions,
    status: ORDER_ITEM_STATUS.AWAITING_CUSTOMER_FORM_APPROVAL,
    updated_at: now,
  };

  // Update customisation fields if provided
  if (data.style) updateFields.style = data.style;
  if (data.color) updateFields.color = data.color;
  if (data.fabric) updateFields.fabric = data.fabric;
  if (data.measurements) updateFields.measurements = data.measurements;
  if (data.selectedCategories || data.measurementCategories) {
    updateFields.measurement_categories =
      data.selectedCategories || data.measurementCategories;
  }
  if (data.garmentNotes !== undefined) updateFields.garment_notes = data.garmentNotes;

  await item.update(updateFields);

  // Log activity
  const actionText = isEditMode
    ? "Order form updated (new version)"
    : "Order form generated";

  await OrderActivity.log({
    orderId: item.order_id,
    orderItemId: itemId,
    action: actionText,
    actionType: "FORM_GENERATED",
    userId: user?.id || null,
    userName: user?.name || null,
    details: { versionId, isEditMode },
  });

  // Update parent order timestamp (status stays — AWAITING_CUSTOMER_FORM_APPROVAL
  // is an item-level status, not a valid order-level status)
  await Order.update(
    { updated_at: now },
    { where: { id: item.order_id } }
  );

  return getOrderItemById(itemId);
}

// ─── APPROVE customer form ────────────────────────────────────────────

async function approveForm(itemId, data, user) {
  const item = await OrderItem.findByPk(itemId);
  if (!item) {
    throw serviceError("Order item not found", 404, "ORDER_ITEM_NOT_FOUND");
  }

  const now = new Date().toISOString();
  const approvedBy = data?.approvedBy || user?.name || "System";

  // Determine next status based on size type.
  // SIZE_TYPE.CUSTOM === "custom" (lowercase), and size_type is persisted
  // lowercase by the services + validators — normalize defensively to
  // guard against any stray casing.
  const normalizedSizeType = (item.size_type || "").toLowerCase();
  const isCustom = normalizedSizeType === SIZE_TYPE.CUSTOM;

  let nextStatus;
  let timelineAction;

  if (isCustom) {
    // Custom items must have a custom BOM built before inventory check
    nextStatus = ORDER_ITEM_STATUS.FABRICATION_BESPOKE;
    timelineAction = "Customer approved form - Forwarded to Fabrication for custom BOM";
  } else {
    nextStatus = ORDER_ITEM_STATUS.INVENTORY_CHECK;
    timelineAction = "Customer approved form - Ready for inventory check";
  }

  await item.update({
    order_form_approved: true,
    status: nextStatus,
    updated_at: now,
  });

  // Log activity
  await OrderActivity.log({
    orderId: item.order_id,
    orderItemId: itemId,
    action: timelineAction,
    actionType: "FORM_APPROVED",
    userId: user?.id || null,
    userName: user?.name || null,
    details: { approvedBy, nextStatus, sizeType: normalizedSizeType },
  });

  // Update parent order timestamp only — item-level statuses
  // (FABRICATION_BESPOKE, INVENTORY_CHECK) should not be pushed onto the
  // parent order, especially when an order has multiple items at
  // different stages. Mirrors the pattern used in generateForm().
  await Order.update(
    { updated_at: now },
    { where: { id: item.order_id } }
  );

  return getOrderItemById(itemId);
}

// ─── Exports ──────────────────────────────────────────────────────────

module.exports = {
  getOrderItemById,
  updateOrderItem,
  deleteOrderItem,
  addOrderItem,
  addTimelineEntry,
  generateForm,
  approveForm,
};