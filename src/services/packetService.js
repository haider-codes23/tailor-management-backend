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

  // Verify all items are picked before allowing completion
  const unpickedItems = (packet.items || []).filter((i) => !i.is_picked);
  if (unpickedItems.length > 0) {
    throw serviceError(
      `${unpickedItems.length} items not yet picked. Please pick all items before completing.`,
      400,
      "INCOMPLETE_PICK_LIST"
    );
  }

  const user = await User.findByPk(userId);
  const now = new Date();

  // =====================================================================
  // Statuses that must NOT be overwritten — already beyond packet stage
  // =====================================================================
  const protectedSectionStatuses = [
    SECTION_STATUS.READY_FOR_DYEING,
    SECTION_STATUS.DYEING_ACCEPTED,
    SECTION_STATUS.DYEING_IN_PROGRESS,
    SECTION_STATUS.DYEING_COMPLETED,
    SECTION_STATUS.DYEING_REJECTED,
    SECTION_STATUS.READY_FOR_PRODUCTION,
    SECTION_STATUS.IN_PRODUCTION,
    SECTION_STATUS.PRODUCTION_COMPLETED,
    SECTION_STATUS.QA_PENDING,
    SECTION_STATUS.QA_APPROVED,
    SECTION_STATUS.QA_REJECTED,
    SECTION_STATUS.READY_FOR_CLIENT_APPROVAL,
    SECTION_STATUS.AWAITING_CLIENT_APPROVAL,
    SECTION_STATUS.CLIENT_APPROVED,
    SECTION_STATUS.COMPLETED,
  ];

  // =====================================================================
  // Timeline + packet record
  // =====================================================================
  const newTimeline = [...(packet.timeline || [])];
  newTimeline.push({
    id: `timeline-${Date.now()}`,
    action: "Packet completed — sections sent to dyeing",
    user: user?.name || "Packet Creator",
    timestamp: now.toISOString(),
    details: notes || "",
  });

  // Packet goes straight to APPROVED (fabrication self-completes, no admin step)
  await packet.update({
    status: PACKET_STATUS.APPROVED,
    completed_at: now,
    checked_by: userId,
    checked_by_name: user?.name || "Packet Creator",
    checked_at: now,
    check_result: "AUTO_APPROVED",
    notes: notes || packet.notes,
    timeline: newTimeline,
  });

  // =====================================================================
  // Update order item + sections — port the sophisticated logic from
  // the old approvePacket path (smart nextStatus, protect advanced sections)
  // =====================================================================
  const orderItem = await OrderItem.findByPk(orderItemId);
  let nextStatus = ORDER_ITEM_STATUS.READY_FOR_DYEING;
  let sectionsForDyeing = [];

  if (orderItem) {
    const sectionStatuses = { ...(orderItem.section_statuses || {}) };
    const sectionsToUpdate = packet.current_round_sections || packet.sections_included || [];

    // Update section_statuses JSONB — only for current-round sections
    // and only if they are NOT already in a protected status
    sectionsToUpdate.forEach((section) => {
      const key = section.toLowerCase();
      if (sectionStatuses[key]) {
        const currentStatus = sectionStatuses[key].status;
        if (!protectedSectionStatuses.includes(currentStatus)) {
          sectionStatuses[key] = {
            ...sectionStatuses[key],
            status: SECTION_STATUS.READY_FOR_DYEING,
            packetCreatedBy: packet.assigned_to,
            packetCreatedByName: packet.assigned_to_name,
            updatedAt: now.toISOString(),
          };
          sectionsForDyeing.push(section);
          console.log(`[completePacket] ${key} → READY_FOR_DYEING`);
        } else {
          console.log(
            `[completePacket] Skipped ${key} — already in protected status: ${currentStatus}`
          );
        }
      }
    });

    // Determine the order item's overall next status by looking at ALL sections
    const allSectionStatuses = Object.values(sectionStatuses);

    const hasQAOrBeyond = allSectionStatuses.some((s) =>
      [
        SECTION_STATUS.QA_PENDING,
        SECTION_STATUS.QA_APPROVED,
        SECTION_STATUS.QA_REJECTED,
        SECTION_STATUS.PRODUCTION_COMPLETED,
      ].includes(s.status)
    );
    const hasInProduction = allSectionStatuses.some((s) =>
      [SECTION_STATUS.IN_PRODUCTION, SECTION_STATUS.READY_FOR_PRODUCTION].includes(s.status)
    );
    const hasDyeingCompleted = allSectionStatuses.some(
      (s) => s.status === SECTION_STATUS.DYEING_COMPLETED
    );
    const hasInDyeing = allSectionStatuses.some((s) =>
      [SECTION_STATUS.DYEING_ACCEPTED, SECTION_STATUS.DYEING_IN_PROGRESS].includes(s.status)
    );
    const hasReadyForDyeing = allSectionStatuses.some(
      (s) => s.status === SECTION_STATUS.READY_FOR_DYEING
    );
    const hasPending = (packet.sections_pending || []).length > 0;

    if (hasPending) {
      // Partial — some sections still awaiting material
      if (hasQAOrBeyond || hasInProduction) {
        nextStatus = orderItem.status || ORDER_ITEM_STATUS.PARTIAL_IN_PRODUCTION;
      } else if (hasInDyeing || hasDyeingCompleted) {
        nextStatus = ORDER_ITEM_STATUS.PARTIALLY_IN_DYEING;
      } else {
        nextStatus = ORDER_ITEM_STATUS.PARTIAL_CREATE_PACKET;
      }
    } else {
      // All sections accounted for
      if (hasQAOrBeyond || hasInProduction) {
        nextStatus = orderItem.status || ORDER_ITEM_STATUS.PARTIAL_IN_PRODUCTION;
      } else if (hasDyeingCompleted && !hasReadyForDyeing && !hasInDyeing) {
        nextStatus = ORDER_ITEM_STATUS.DYEING_COMPLETED;
      } else if (hasInDyeing || hasDyeingCompleted) {
        nextStatus = ORDER_ITEM_STATUS.PARTIALLY_IN_DYEING;
      } else {
        nextStatus = ORDER_ITEM_STATUS.READY_FOR_DYEING;
      }
    }

    await orderItem.update({
      status: nextStatus,
      section_statuses: sectionStatuses,
    });

    // Update parent order
    await Order.update(
      { status: nextStatus, updated_at: now },
      { where: { id: orderItem.order_id } }
    );

    // Update OrderItemSection records — ONLY for sections that were actually
    // moved to READY_FOR_DYEING (i.e., not protected). This fixes the bug where
    // the old approvePacket would overwrite OrderItemSection rows already in
    // advanced stages.
    for (const section of sectionsForDyeing) {
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
            status: { [Op.notIn]: protectedSectionStatuses },
          },
        }
      );
    }

    // Log activity
    await OrderActivity.log({
      orderId: orderItem.order_id,
      orderItemId,
      action: `Packet completed by ${user?.name || "Packet Creator"}. Moving to ${nextStatus}.`,
      actionType: ACTIVITY_ACTION_TYPE.STATUS_CHANGE,
      userId: userId || null,
      userName: user?.name || "Packet Creator",
      details: { nextStatus, sectionsForDyeing },
    });
  }

  const reloaded = await loadPacketWithItems({ id: packet.id });

  // =====================================================================
  // Notify dyeing users (replaces the old admin-verification notification)
  // Only if there are actually sections going into dyeing now
  // =====================================================================
  if (orderItem && sectionsForDyeing.length > 0) {
    const order = await Order.findByPk(orderItem.order_id, { attributes: ["order_number"] });
    notify.dyeingRequired(orderItem, sectionsForDyeing, order?.order_number);
  }

  return {
    packet: serializePacket(reloaded),
    nextStatus,
    message: `Packet completed. Moving to ${nextStatus}`,
  };
}

// NOTE: approvePacket removed — fabrication self-completes via completePacket.


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
};