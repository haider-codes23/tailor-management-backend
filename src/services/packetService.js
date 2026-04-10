/**
 * Packet Service — Phase 10
 *
 * Business logic for the packet workflow:
 *   1. getPacket          — Get packet for an order item (with pickList)
 *   2. listPackets        — List all packets (with filters)
 *   3. getMyTasks         — Packets assigned to current user
 *   4. getCheckQueue      — Packets awaiting verification (COMPLETED)
 *   5. assignPacket       — Production Head assigns to Packet Creator
 *   6. startPacket        — Packet Creator starts picking
 *   7. pickItem           — Mark a pick list item as picked
 *   8. completePacket     — Packet Creator marks picking complete
 *   9. approvePacket      — Production Head approves
 *   10. rejectPacket      — Production Head rejects (reason required)
 */

const { Op } = require("sequelize");
const {
  sequelize,
  Packet,
  PacketItem,
  OrderItem,
  OrderItemSection,
  Order,
  OrderActivity,
  User,
  InventoryItem,
} = require("../models");

const notify = require("./notificationTriggers");

const {
  ORDER_ITEM_STATUS,
  SECTION_STATUS,
  ACTIVITY_ACTION_TYPE,
} = require("../constants/order");

const PACKET_STATUS = {
  PENDING: "PENDING",
  ASSIGNED: "ASSIGNED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  INVALIDATED: "INVALIDATED",
};

// =========================================================================
// Helpers
// =========================================================================

function serviceError(msg, status = 400, code = "PACKET_ERROR") {
  const err = new Error(msg);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Serialize a packet + its items into the camelCase shape the frontend expects.
 * The frontend expects a `pickList` array nested inside the packet.
 */
function serializePacket(packet, items) {
  if (!packet) return null;
  const json = packet.toJSON ? packet.toJSON() : packet;

  // Build pickList from PacketItem rows
  const pickList = (items || json.items || []).map((pi) => {
    const pij = pi.toJSON ? pi.toJSON() : pi;
    return {
      id: pij.id,
      inventoryItemId: pij.inventory_item_id,
      inventoryItemName: pij.inventory_item_name,
      inventoryItemSku: pij.inventory_item_sku,
      inventoryItemCategory: pij.inventory_item_category,
      requiredQty: parseFloat(pij.required_qty) || 0,
      unit: pij.unit,
      rackLocation: pij.rack_location,
      piece: pij.piece,
      isPicked: pij.is_picked || false,
      pickedQty: parseFloat(pij.picked_qty) || 0,
      pickedAt: pij.picked_at,
      notes: pij.notes,
    };
  });

  return {
    id: json.id,
    orderItemId: json.order_item_id,
    orderId: json.order_id,
    status: json.status,
    isPartial: json.is_partial || false,
    packetRound: json.packet_round || 1,
    sectionsIncluded: json.sections_included || [],
    sectionsPending: json.sections_pending || [],
    currentRoundSections: json.current_round_sections || null,
    verifiedSections: json.verified_sections || [],
    // Assignment
    assignedTo: json.assigned_to,
    assignedToName: json.assigned_to_name,
    assignedBy: json.assigned_by,
    assignedByName: json.assigned_by_name,
    assignedAt: json.assigned_at,
    // Progress
    startedAt: json.started_at,
    completedAt: json.completed_at,
    // Verification
    checkedBy: json.checked_by,
    checkedByName: json.checked_by_name,
    checkedAt: json.checked_at,
    checkResult: json.check_result,
    rejectionReason: json.rejection_reason,
    rejectionReasonCode: json.rejection_reason_code,
    rejectionNotes: json.rejection_notes,
    // Counts
    totalItems: json.total_items || 0,
    pickedItems: json.picked_items || 0,
    previousRoundPickedItems: json.previous_round_picked_items,
    // Misc
    notes: json.notes,
    timeline: json.timeline || [],
    removedPickListItems: json.removed_pick_list_items || [],
    previousAssignee: json.previous_assignee,
    // Pick list
    pickList,
    // Timestamps
    createdAt: json.created_at,
    updatedAt: json.updated_at,
  };
}

/**
 * Load a packet with its items (standard include pattern).
 */
async function loadPacketWithItems(where, transaction = null) {
  const opts = {
    where,
    include: [{ model: PacketItem, as: "items", order: [["piece", "ASC"]] }],
  };
  if (transaction) opts.transaction = transaction;
  return Packet.findOne(opts);
}

// =========================================================================
// 1. GET PACKET FOR ORDER ITEM
// =========================================================================

async function getPacket(orderItemId) {
  const packet = await loadPacketWithItems({ order_item_id: orderItemId });
  if (!packet) {
    throw serviceError(
      `No packet found for order item ${orderItemId}`,
      404,
      "PACKET_NOT_FOUND"
    );
  }

  // Get order item details for enrichment
  const orderItem = await OrderItem.findByPk(orderItemId, {
    attributes: ["id", "product_name", "product_sku", "product_image", "size", "quantity", "order_id"],
  });

  const serialized = serializePacket(packet);
  serialized.orderItemDetails = orderItem
    ? {
        productName: orderItem.product_name,
        productSku: orderItem.product_sku,
        productImage: orderItem.product_image,
        size: orderItem.size,
        quantity: orderItem.quantity,
        orderId: orderItem.order_id,
      }
    : null;

  return serialized;
}

// =========================================================================
// 2. LIST PACKETS
// =========================================================================

async function listPackets(filters = {}) {
  const where = {};
  if (filters.status) where.status = filters.status;
  if (filters.assignedTo) where.assigned_to = filters.assignedTo;

  const packets = await Packet.findAll({
    where,
    include: [
      { model: PacketItem, as: "items" },
      {
        model: OrderItem,
        as: "orderItem",
        attributes: ["id", "product_name", "product_sku", "product_image", "size", "quantity", "order_id"],
      },
    ],
    order: [["created_at", "DESC"]],
  });

  return packets.map((p) => {
    const serialized = serializePacket(p);
    const oi = p.orderItem;
    serialized.orderItemDetails = oi
      ? {
          productName: oi.product_name,
          productSku: oi.product_sku,
          productImage: oi.product_image,
          size: oi.size,
          quantity: oi.quantity,
          orderId: oi.order_id,
        }
      : null;
    return serialized;
  });
}

// =========================================================================
// 3. MY TASKS
// =========================================================================

async function getMyTasks(userId, status = null, dateFilters = {}) {
  const where = { assigned_to: userId };
  if (status) where.status = status;

  if (dateFilters.startDate || dateFilters.endDate) {
    where.created_at = {};
    if (dateFilters.startDate) where.created_at[Op.gte] = new Date(dateFilters.startDate);
    if (dateFilters.endDate) where.created_at[Op.lte] = new Date(dateFilters.endDate);
  }

  const packets = await Packet.findAll({
    where,
    include: [
      { model: PacketItem, as: "items" },
      {
        model: OrderItem,
        as: "orderItem",
        attributes: ["id", "product_name", "product_sku", "product_image", "size", "quantity", "order_id"],
      },
    ],
    order: [["created_at", "DESC"]],
  });

  return packets.map((p) => {
    const serialized = serializePacket(p);
    const oi = p.orderItem;
    serialized.orderItemDetails = oi
      ? {
          productName: oi.product_name,
          productSku: oi.product_sku,
          productImage: oi.product_image,
          size: oi.size,
          quantity: oi.quantity,
          orderId: oi.order_id,
        }
      : null;
    return serialized;
  });
}

// =========================================================================
// 4. CHECK QUEUE
// =========================================================================

async function getCheckQueue() {
  const packets = await Packet.findAll({
    where: { status: PACKET_STATUS.COMPLETED },
    include: [
      { model: PacketItem, as: "items" },
      {
        model: OrderItem,
        as: "orderItem",
        attributes: ["id", "product_name", "product_sku", "product_image", "size", "quantity", "order_id"],
      },
    ],
    order: [["completed_at", "ASC"]], // FIFO
  });

  return packets.map((p) => {
    const serialized = serializePacket(p);
    const oi = p.orderItem;
    serialized.orderItemDetails = oi
      ? {
          productName: oi.product_name,
          productSku: oi.product_sku,
          productImage: oi.product_image,
          size: oi.size,
          quantity: oi.quantity,
          orderId: oi.order_id,
        }
      : null;
    return serialized;
  });
}

// =========================================================================
// 5. ASSIGN PACKET
// =========================================================================

async function assignPacket(orderItemId, { assignToUserId, assignedByUserId }) {
  const packet = await loadPacketWithItems({ order_item_id: orderItemId });
  if (!packet) {
    throw serviceError(`No packet found for order item ${orderItemId}`, 404, "PACKET_NOT_FOUND");
  }

  const assignee = await User.findByPk(assignToUserId);
  if (!assignee) {
    throw serviceError(`User ${assignToUserId} not found`, 400, "USER_NOT_FOUND");
  }

  const assigner = await User.findByPk(assignedByUserId);
  const now = new Date();

  const newTimeline = [...(packet.timeline || [])];
  newTimeline.push({
    id: `timeline-${Date.now()}`,
    action: "Packet assigned",
    user: assigner?.name || "Production Head",
    timestamp: now.toISOString(),
    details: `Assigned to ${assignee.name}`,
  });

  await packet.update({
    assigned_to: assignToUserId,
    assigned_to_name: assignee.name,
    assigned_by: assignedByUserId,
    assigned_by_name: assigner?.name || "Unknown",
    assigned_at: now,
    status: PACKET_STATUS.ASSIGNED,
    timeline: newTimeline,
  });

  notify.packetAssigned({ ...packet.toJSON(), assigned_to: assignToUserId });

  return {
    packet: serializePacket(packet),
    message: `Packet assigned to ${assignee.name}`,
  };
}

// =========================================================================
// 6. START PACKET
// =========================================================================

async function startPacket(orderItemId, { userId }) {
  const packet = await loadPacketWithItems({ order_item_id: orderItemId });
  if (!packet) {
    throw serviceError(`No packet found for order item ${orderItemId}`, 404, "PACKET_NOT_FOUND");
  }

  if (packet.status !== PACKET_STATUS.ASSIGNED) {
    throw serviceError(
      `Cannot start packet in ${packet.status} status. Must be ASSIGNED.`,
      400,
      "INVALID_STATUS"
    );
  }

  const user = await User.findByPk(userId);
  const now = new Date();

  const newTimeline = [...(packet.timeline || [])];
  newTimeline.push({
    id: `timeline-${Date.now()}`,
    action: "Picking started",
    user: user?.name || "Packet Creator",
    timestamp: now.toISOString(),
  });

  await packet.update({
    status: PACKET_STATUS.IN_PROGRESS,
    started_at: now,
    timeline: newTimeline,
  });

  return {
    packet: serializePacket(packet),
    message: "Packet picking started",
  };
}

// =========================================================================
// 7. PICK ITEM
// =========================================================================

async function pickItem(orderItemId, { pickItemId, pickedQty, userId, notes }) {
  const packet = await loadPacketWithItems({ order_item_id: orderItemId });
  if (!packet) {
    throw serviceError(`No packet found for order item ${orderItemId}`, 404, "PACKET_NOT_FOUND");
  }

  if (packet.status !== PACKET_STATUS.IN_PROGRESS) {
    throw serviceError(
      `Cannot pick items in ${packet.status} status. Must be IN_PROGRESS.`,
      400,
      "INVALID_STATUS"
    );
  }

  // Find the pick list item
  const pickListItem = await PacketItem.findByPk(pickItemId);
  if (!pickListItem || pickListItem.packet_id !== packet.id) {
    throw serviceError(`Pick list item ${pickItemId} not found`, 404, "PICK_ITEM_NOT_FOUND");
  }

  const now = new Date();
  const user = await User.findByPk(userId);

  await pickListItem.update({
    is_picked: true,
    picked_qty: pickedQty,
    picked_at: now,
    notes: notes || pickListItem.notes,
  });

  // Update picked count on the packet
  const allItems = await PacketItem.findAll({ where: { packet_id: packet.id } });
  const pickedCount = allItems.filter((i) => i.is_picked).length;

  const newTimeline = [...(packet.timeline || [])];
  newTimeline.push({
    id: `timeline-${Date.now()}`,
    action: `Item picked: ${pickListItem.inventory_item_name}`,
    user: user?.name || "Packet Creator",
    timestamp: now.toISOString(),
    details: `Qty: ${pickedQty} ${pickListItem.unit || ""} from ${pickListItem.rack_location || "TBD"}`,
  });

  await packet.update({
    picked_items: pickedCount,
    timeline: newTimeline,
  });

  // Reload packet with items
  const reloaded = await loadPacketWithItems({ id: packet.id });

  return {
    packet: serializePacket(reloaded),
    message: `Picked ${pickListItem.inventory_item_name}`,
  };
}

// =========================================================================
// 8. COMPLETE PACKET
// =========================================================================

async function completePacket(orderItemId, { userId, notes }) {
  const packet = await loadPacketWithItems({ order_item_id: orderItemId });
  if (!packet) {
    throw serviceError(`No packet found for order item ${orderItemId}`, 404, "PACKET_NOT_FOUND");
  }

  if (packet.status !== PACKET_STATUS.IN_PROGRESS) {
    throw serviceError(
      `Cannot complete packet in ${packet.status} status. Must be IN_PROGRESS.`,
      400,
      "INVALID_STATUS"
    );
  }

  const user = await User.findByPk(userId);
  const now = new Date();

  const newTimeline = [...(packet.timeline || [])];
  newTimeline.push({
    id: `timeline-${Date.now()}`,
    action: "Packet completed",
    user: user?.name || "Packet Creator",
    timestamp: now.toISOString(),
    details: notes || "",
  });

  await packet.update({
    status: PACKET_STATUS.COMPLETED,
    completed_at: now,
    notes: notes || packet.notes,
    timeline: newTimeline,
  });

  // Update order item status to PACKET_CHECK
  const orderItem = await OrderItem.findByPk(orderItemId);
  if (orderItem) {
    // Check if partial — only update sections that are in this round
    const sectionStatuses = { ...(orderItem.section_statuses || {}) };
    const sectionsToUpdate = packet.current_round_sections || packet.sections_included || [];

    sectionsToUpdate.forEach((section) => {
      const key = section.toLowerCase();
      if (sectionStatuses[key]) {
        sectionStatuses[key] = {
          ...sectionStatuses[key],
          status: SECTION_STATUS.PACKET_CREATED,
          updatedAt: now.toISOString(),
        };
      }
    });

    await orderItem.update({
      status: ORDER_ITEM_STATUS.PACKET_CHECK,
      section_statuses: sectionStatuses,
    });

    // Update parent order
    await Order.update(
      { status: ORDER_ITEM_STATUS.PACKET_CHECK },
      { where: { id: orderItem.order_id } }
    );

    // Log activity
    await OrderActivity.log({
      orderId: orderItem.order_id,
      orderItemId,
      action: `Packet completed by ${user?.name || "Packet Creator"}. Ready for verification.`,
      actionType: ACTIVITY_ACTION_TYPE.STATUS_CHANGE,
      userId: userId || null,
      userName: user?.name || "Packet Creator",
    });
  }

  const reloaded = await loadPacketWithItems({ id: packet.id });

  notify.packetCompleted(packet);

  return {
    packet: serializePacket(reloaded),
    message: "Packet completed. Ready for verification.",
  };
}

// =========================================================================
// 9. APPROVE PACKET
// =========================================================================

async function approvePacket(orderItemId, { userId, isReadyStock, notes }) {
  const packet = await loadPacketWithItems({ order_item_id: orderItemId });
  if (!packet) {
    throw serviceError(`No packet found for order item ${orderItemId}`, 404, "PACKET_NOT_FOUND");
  }

  if (packet.status !== PACKET_STATUS.COMPLETED) {
    throw serviceError(
      `Cannot approve packet in ${packet.status} status. Must be COMPLETED.`,
      400,
      "INVALID_STATUS"
    );
  }

  const user = await User.findByPk(userId);
  const now = new Date();

  // Determine next status based on whether it's ready stock or production
  let nextStatus;
  if (isReadyStock) {
    nextStatus = ORDER_ITEM_STATUS.AWAITING_CLIENT_APPROVAL;
  } else {
    nextStatus = ORDER_ITEM_STATUS.READY_FOR_DYEING;
  }

  const newTimeline = [...(packet.timeline || [])];
  newTimeline.push({
    id: `timeline-${Date.now()}`,
    action: "Packet approved",
    user: user?.name || "Production Head",
    timestamp: now.toISOString(),
    details: `Next: ${nextStatus}${notes ? `. Notes: ${notes}` : ""}`,
  });

  await packet.update({
    status: PACKET_STATUS.APPROVED,
    checked_by: userId,
    checked_by_name: user?.name || "Production Head",
    checked_at: now,
    check_result: "APPROVED",
    notes: notes || packet.notes,
    timeline: newTimeline,
  });

  // Update order item and sections
  const orderItem = await OrderItem.findByPk(orderItemId);
  if (orderItem) {
    const sectionStatuses = { ...(orderItem.section_statuses || {}) };
    const sectionsToUpdate = packet.current_round_sections || packet.sections_included || [];

    sectionsToUpdate.forEach((section) => {
      const key = section.toLowerCase();
      if (sectionStatuses[key]) {
        sectionStatuses[key] = {
          ...sectionStatuses[key],
          status: SECTION_STATUS.READY_FOR_DYEING,
          packetCreatedBy: packet.assigned_to,
          packetCreatedByName: packet.assigned_to_name,
          updatedAt: now.toISOString(),
        };
      }
    });

    // Check if this is a partial packet with pending sections
    const hasPending = (packet.sections_pending || []).length > 0;
    const finalStatus = hasPending
      ? ORDER_ITEM_STATUS.PARTIAL_CREATE_PACKET
      : nextStatus;

    await orderItem.update({
      status: finalStatus,
      section_statuses: sectionStatuses,
    });

    await Order.update(
      { status: finalStatus },
      { where: { id: orderItem.order_id } }
    );

    // Update OrderItemSection records
    for (const section of sectionsToUpdate) {
      await OrderItemSection.update(
        {
          status: SECTION_STATUS.READY_FOR_DYEING,
          status_updated_at: now,
          status_updated_by: userId,
        },
        {
          where: {
            order_item_id: orderItemId,
            piece: { [Op.iLike]: section.toLowerCase() },
          },
        }
      );
    }

    await OrderActivity.log({
      orderId: orderItem.order_id,
      orderItemId,
      action: `Packet approved by ${user?.name || "Production Head"}. Moving to ${finalStatus}.`,
      actionType: ACTIVITY_ACTION_TYPE.STATUS_CHANGE,
      userId: userId || null,
      userName: user?.name || "Production Head",
      details: { nextStatus: finalStatus, isReadyStock },
    });
  }

  const reloaded = await loadPacketWithItems({ id: packet.id });

  notify.packetApproved({ ...packet.toJSON() });

  if (!isReadyStock && orderItem) {
    const order = await Order.findByPk(orderItem.order_id, { attributes: ["order_number"] });
    const sectionsForDyeing = packet.current_round_sections || packet.sections_included || [];
    notify.dyeingRequired(orderItem, sectionsForDyeing, order?.order_number);
  }

  return {
    packet: serializePacket(reloaded),
    nextStatus: orderItem
      ? (packet.sections_pending || []).length > 0
        ? ORDER_ITEM_STATUS.PARTIAL_CREATE_PACKET
        : nextStatus
      : nextStatus,
    message: `Packet approved. Moving to ${nextStatus}`,
  };
}

// =========================================================================
// 10. REJECT PACKET
// =========================================================================

async function rejectPacket(orderItemId, { userId, reasonCode, reason, notes }) {
  if (!reasonCode || !reason) {
    throw serviceError("Rejection reason is required", 400, "VALIDATION_FAILED");
  }

  const packet = await loadPacketWithItems({ order_item_id: orderItemId });
  if (!packet) {
    throw serviceError(`No packet found for order item ${orderItemId}`, 404, "PACKET_NOT_FOUND");
  }

  if (packet.status !== PACKET_STATUS.COMPLETED) {
    throw serviceError(
      `Cannot reject packet in ${packet.status} status. Must be COMPLETED.`,
      400,
      "INVALID_STATUS"
    );
  }

  const user = await User.findByPk(userId);
  const now = new Date();

  // Determine which sections are being rejected
  const sectionsBeingRejected =
    packet.packet_round > 1 && packet.current_round_sections?.length > 0
      ? packet.current_round_sections
      : packet.sections_included?.length > 0
        ? packet.sections_included
        : [];

  // Reset packet — back to ASSIGNED (same user redo)
  const newTimeline = [...(packet.timeline || [])];
  newTimeline.push({
    id: `timeline-${Date.now()}`,
    action: "Packet rejected",
    user: user?.name || "Production Head",
    timestamp: now.toISOString(),
    details: `Reason: ${reason}${notes ? `. Notes: ${notes}` : ""}`,
  });

  // Reset pick list items for the rejected sections
  const sectionsLower = sectionsBeingRejected.map((s) => s.toLowerCase());
  const itemsToReset = packet.items.filter((i) =>
    sectionsLower.includes((i.piece || "").toLowerCase())
  );

  for (const item of itemsToReset) {
    await item.update({
      is_picked: false,
      picked_qty: 0,
      picked_at: null,
      notes: "",
    });
  }

  // Count remaining picked items (from other rounds/sections)
  const allItems = await PacketItem.findAll({ where: { packet_id: packet.id } });
  const remainingPicked = allItems.filter((i) => i.is_picked).length;

  await packet.update({
    status: PACKET_STATUS.ASSIGNED, // Back to same assignee
    picked_items: remainingPicked,
    check_result: "REJECTED",
    rejection_reason: reason,
    rejection_reason_code: reasonCode,
    rejection_notes: notes || null,
    checked_by: userId,
    checked_by_name: user?.name || "Production Head",
    checked_at: now,
    completed_at: null, // Reset completion
    timeline: newTimeline,
  });

  // Update order item — sections go back to CREATE_PACKET
  const orderItem = await OrderItem.findByPk(orderItemId);
  if (orderItem) {
    const sectionStatuses = { ...(orderItem.section_statuses || {}) };

    sectionsLower.forEach((sectionKey) => {
      if (sectionStatuses[sectionKey]) {
        sectionStatuses[sectionKey] = {
          ...sectionStatuses[sectionKey],
          status: SECTION_STATUS.CREATE_PACKET,
          packetRejectedAt: now.toISOString(),
          packetRejectionReason: reason,
          packetRejectionNotes: notes || "",
          packetRejectedBy: user?.name || "Production Head",
          updatedAt: now.toISOString(),
        };
      }
    });

    await orderItem.update({
      status: ORDER_ITEM_STATUS.CREATE_PACKET,
      section_statuses: sectionStatuses,
    });

    await Order.update(
      { status: ORDER_ITEM_STATUS.CREATE_PACKET },
      { where: { id: orderItem.order_id } }
    );

    // Update OrderItemSection records
    for (const section of sectionsLower) {
      await OrderItemSection.update(
        {
          status: SECTION_STATUS.CREATE_PACKET,
          status_updated_at: now,
          status_updated_by: userId,
        },
        {
          where: {
            order_item_id: orderItemId,
            piece: { [Op.iLike]: section },
          },
        }
      );
    }

    await OrderActivity.log({
      orderId: orderItem.order_id,
      orderItemId,
      action: `Packet rejected — ${reason}. Sent back to ${packet.assigned_to_name || "Packet Creator"} for correction.`,
      actionType: ACTIVITY_ACTION_TYPE.STATUS_CHANGE,
      userId: userId || null,
      userName: user?.name || "Production Head",
      details: {
        reasonCode,
        reason,
        notes,
        sectionsRejected: sectionsBeingRejected,
      },
    });
  }

  const reloaded = await loadPacketWithItems({ id: packet.id });

  notify.packetRejected({ ...packet.toJSON() }, reason);

  return {
    packet: serializePacket(reloaded),
    message: `Packet rejected. Sent back to ${packet.assigned_to_name || "Packet Creator"} for correction.`,
  };
}

// =========================================================================
// Exports
// =========================================================================

module.exports = {
  getPacket,
  listPackets,
  getMyTasks,
  getCheckQueue,
  assignPacket,
  startPacket,
  pickItem,
  completePacket,
  approvePacket,
  rejectPacket,
};