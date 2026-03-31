/**
 * Dyeing Service — Phase 11
 *
 * Section-level dyeing workflow. Operates on order_items.section_statuses
 * JSONB and order_item_sections table. No dedicated dyeing table needed.
 *
 * Rejection triggers: inventory reversal, packet invalidation, and sends
 * the section back to PENDING_INVENTORY_CHECK for the full re-creation loop.
 */

const { Op } = require("sequelize");
const {
  OrderItem,
  OrderItemSection,
  Order,
  User,
  Packet,
  PacketItem,
  InventoryItem,
  InventoryMovement,
  OrderActivity,
} = require("../models");
const {
  ORDER_ITEM_STATUS,
  SECTION_STATUS,
  ACTIVITY_ACTION_TYPE,
  DYEING_REJECTION_REASONS,
  ORDER_STATUS_VALUES,
} = require("../constants/order");

// ─── Helpers ──────────────────────────────────────────────────────────

function serviceError(message, status, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Safely update order status — only if newStatus is a valid order-level status
 */
async function safeUpdateOrderStatus(orderId, newStatus) {
  if (newStatus && ORDER_STATUS_VALUES.includes(newStatus)) {
    await Order.update({ status: newStatus }, { where: { id: orderId } });
  }
}

/**
 * Calculate aggregate order item status from section statuses (mirrors MSW)
 */
function calculateOrderItemStatus(sectionStatuses) {
  const sections = Object.values(sectionStatuses || {});
  if (sections.length === 0) return null;

  const inDyeing = sections.filter((s) =>
    [
      SECTION_STATUS.READY_FOR_DYEING,
      SECTION_STATUS.DYEING_ACCEPTED,
      SECTION_STATUS.DYEING_IN_PROGRESS,
    ].includes(s.status)
  );
  const dyeingCompleted = sections.filter(
    (s) => s.status === SECTION_STATUS.DYEING_COMPLETED
  );
  const readyForProduction = sections.filter(
    (s) => s.status === SECTION_STATUS.READY_FOR_PRODUCTION
  );
  const awaitingMaterial = sections.filter(
    (s) => s.status === SECTION_STATUS.AWAITING_MATERIAL
  );
  const inPacketFlow = sections.filter((s) =>
    [
      SECTION_STATUS.PENDING_INVENTORY_CHECK,
      SECTION_STATUS.INVENTORY_PASSED,
      SECTION_STATUS.CREATE_PACKET,
      SECTION_STATUS.PACKET_CREATED,
      SECTION_STATUS.PACKET_VERIFIED,
    ].includes(s.status)
  );

  if (readyForProduction.length === sections.length) {
    return ORDER_ITEM_STATUS.READY_FOR_PRODUCTION;
  }
  if (dyeingCompleted.length === sections.length) {
    return ORDER_ITEM_STATUS.DYEING_COMPLETED;
  }
  if (inDyeing.length === sections.length) {
    return ORDER_ITEM_STATUS.IN_DYEING;
  }
  if (inDyeing.length > 0 || dyeingCompleted.length > 0) {
    return ORDER_ITEM_STATUS.PARTIALLY_IN_DYEING;
  }
  const allReady = sections.every(
    (s) => s.status === SECTION_STATUS.READY_FOR_DYEING
  );
  if (allReady) {
    return ORDER_ITEM_STATUS.READY_FOR_DYEING;
  }
  // Fallback for mixed states after rejection
  if (awaitingMaterial.length > 0 || inPacketFlow.length > 0) {
    if (inDyeing.length > 0 || dyeingCompleted.length > 0) {
      return ORDER_ITEM_STATUS.PARTIALLY_IN_DYEING;
    }
    const hasPending = sections.some(
      (s) => s.status === SECTION_STATUS.PENDING_INVENTORY_CHECK
    );
    if (hasPending) return ORDER_ITEM_STATUS.INVENTORY_CHECK;
    if (awaitingMaterial.length > 0) return ORDER_ITEM_STATUS.AWAITING_MATERIAL;
  }
  return null; // keep current
}

/**
 * Load order item with sections for dyeing operations
 */
async function loadOrderItem(orderItemId) {
  const item = await OrderItem.findByPk(orderItemId, {
    include: [{ model: OrderItemSection, as: "sections" }],
  });
  if (!item) {
    throw serviceError("Order item not found", 404, "ORDER_ITEM_NOT_FOUND");
  }
  return item;
}

/**
 * Serialize order item for frontend (camelCase)
 */
function serializeOrderItem(item) {
  const raw = item.toJSON ? item.toJSON() : item;
  return {
    id: raw.id,
    orderId: raw.order_id,
    productId: raw.product_id,
    productName: raw.product_name,
    productSku: raw.product_sku,
    productImage: raw.product_image,
    size: raw.size,
    quantity: raw.quantity,
    status: raw.status,
    sectionStatuses: raw.section_statuses,
    sections: (raw.sections || []).map((s) => ({
      id: s.id,
      piece: s.piece,
      type: s.type,
      status: s.status,
      price: s.price,
    })),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════════════

/**
 * GET /api/dyeing/available-tasks
 * Find order items with sections in READY_FOR_DYEING (not yet accepted)
 */
async function getAvailableTasks({ sortBy = "fwdDate", sortOrder = "asc" } = {}) {
  // Find order items that have at least one section in READY_FOR_DYEING
  const items = await OrderItem.findAll({
    include: [
      { model: OrderItemSection, as: "sections" },
      {
        model: Order,
        as: "order",
        attributes: ["id", "order_number", "customer_name", "fwd_date", "urgent"],
      },
    ],
  });

  const available = [];
  for (const item of items) {
    const ss = item.section_statuses || {};
    const readySections = Object.entries(ss).filter(
      ([, v]) => v.status === SECTION_STATUS.READY_FOR_DYEING
    );
    if (readySections.length === 0) continue;

    // Build sections array matching MSW format: { name, status, round }
    const readySectionObjects = readySections.map(([k, v]) => ({
      name: k.charAt(0).toUpperCase() + k.slice(1),
      status: v.status,
      round: v.dyeingRound || 1,
      materials: [],
    }));

    // Other sections for context
    const otherSections = Object.entries(ss)
      .filter(([, v]) => v.status !== SECTION_STATUS.READY_FOR_DYEING)
      .map(([k, v]) => ({
        name: k.charAt(0).toUpperCase() + k.slice(1),
        status: v.status,
      }));

    available.push({
      id: `pending-${item.id}`,
      orderItemId: item.id,
      orderId: item.order_id,
      orderNumber: item.order?.order_number || "",
      customerName: item.order?.customer_name || "",
      productName: item.product_name,
      productSku: item.product_sku,
      productImage: item.product_image,
      size: item.size,
      quantity: item.quantity,
      fwdDate: item.order?.fwd_date || null,
      priority: item.order?.urgent ? "URGENT" : null,
      status: item.status,
      sections: readySectionObjects,
      otherSections,
      sectionStatuses: ss,
    });
  }

  // Sort
  available.sort((a, b) => {
    let valA, valB;
    if (sortBy === "fwdDate") {
      valA = a.orderDetails?.fwdDate || "";
      valB = b.orderDetails?.fwdDate || "";
    } else {
      valA = a.productName || "";
      valB = b.productName || "";
    }
    const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
    return sortOrder === "desc" ? -cmp : cmp;
  });

  return available;
}

/**
 * GET /api/dyeing/my-tasks
 * Get order items where current user has accepted sections for dyeing
 */
async function getMyTasks(userId, { sortBy, sortOrder } = {}) {
  const items = await OrderItem.findAll({
    include: [
      { model: OrderItemSection, as: "sections" },
      {
        model: Order,
        as: "order",
        attributes: ["id", "order_number", "customer_name", "fwd_date", "urgent"],
      },
    ],
  });

  const myTasks = [];
  for (const item of items) {
    const ss = item.section_statuses || {};
    const mySections = Object.entries(ss).filter(
      ([, v]) =>
        v.dyeingAcceptedBy === userId &&
        [
          SECTION_STATUS.DYEING_ACCEPTED,
          SECTION_STATUS.DYEING_IN_PROGRESS,
        ].includes(v.status)
    );
    if (mySections.length === 0) continue;

    // Build sections array for this user's accepted sections
    const mySectionObjects = mySections.map(([k, v]) => ({
      name: k.charAt(0).toUpperCase() + k.slice(1),
      status: v.status,
      round: v.dyeingRound || 1,
      acceptedAt: v.dyeingAcceptedAt,
      startedAt: v.dyeingStartedAt,
      completedAt: v.dyeingCompletedAt,
      materials: [],
    }));

    const otherSections = Object.entries(ss)
      .filter(
        ([, v]) =>
          !(v.dyeingAcceptedBy === userId &&
            [SECTION_STATUS.DYEING_ACCEPTED, SECTION_STATUS.DYEING_IN_PROGRESS].includes(v.status))
      )
      .map(([k, v]) => ({
        name: k.charAt(0).toUpperCase() + k.slice(1),
        status: v.status,
      }));

    myTasks.push({
      id: `task-${item.id}`,
      orderItemId: item.id,
      orderId: item.order_id,
      orderNumber: item.order?.order_number || "",
      customerName: item.order?.customer_name || "",
      productName: item.product_name,
      productSku: item.product_sku,
      productImage: item.product_image,
      size: item.size,
      quantity: item.quantity,
      fwdDate: item.order?.fwd_date || null,
      priority: item.order?.urgent ? "URGENT" : null,
      status: item.status,
      sections: mySectionObjects,
      otherSections,
      sectionStatuses: ss,
    });
  }

  return myTasks;
}

/**
 * GET /api/dyeing/completed-tasks
 * Get order items where sections have completed dyeing
 */
async function getCompletedTasks({ userId, page = 1, limit = 20, startDate, endDate } = {}) {
  const items = await OrderItem.findAll({
    include: [
      { model: OrderItemSection, as: "sections" },
      {
        model: Order,
        as: "order",
        attributes: ["id", "order_number", "customer_name", "fwd_date"],
      },
    ],
  });

  let completed = [];
  for (const item of items) {
    const ss = item.section_statuses || {};
    const doneSections = Object.entries(ss).filter(([, v]) => {
      const isDone =
        v.status === SECTION_STATUS.READY_FOR_PRODUCTION && v.dyeingCompletedAt;
      if (userId && v.dyeingAcceptedBy !== userId) return false;
      if (startDate && v.dyeingCompletedAt < startDate) return false;
      if (endDate && v.dyeingCompletedAt > endDate) return false;
      return isDone;
    });
    if (doneSections.length === 0) continue;

    const completedSectionObjects = doneSections.map(([k, v]) => ({
      name: k.charAt(0).toUpperCase() + k.slice(1),
      completedAt: v.dyeingCompletedAt,
      duration:
        v.dyeingStartedAt && v.dyeingCompletedAt
          ? new Date(v.dyeingCompletedAt) - new Date(v.dyeingStartedAt)
          : null,
    }));

    completed.push({
      orderItemId: item.id,
      orderId: item.order_id,
      orderNumber: item.order?.order_number || "",
      customerName: item.order?.customer_name || "",
      productName: item.product_name,
      productSku: item.product_sku,
      size: item.size,
      status: item.status,
      sections: completedSectionObjects,
      completedSections: completedSectionObjects,
      completedAt: completedSectionObjects[0]?.completedAt,
      sectionStatuses: ss,
    });
  }

  const total = completed.length;
  const offset = (page - 1) * limit;
  const tasks = completed.slice(offset, offset + limit);

  return { tasks, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
}

/**
 * GET /api/dyeing/task/:orderItemId
 * Get detailed dyeing info for a specific order item
 */
async function getTaskDetails(orderItemId) {
  const item = await loadOrderItem(orderItemId);
  const order = await Order.findByPk(item.order_id, {
    attributes: ["id", "order_number", "customer_name", "fwd_date", "urgent"],
  });

  const ss = item.section_statuses || {};

  // Build sections array with full dyeing details (matching MSW format)
  const sections = Object.entries(ss).map(([name, data]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    status: data.status,
    round: data.dyeingRound || 1,
    dyeingAcceptedAt: data.dyeingAcceptedAt || null,
    dyeingAcceptedBy: data.dyeingAcceptedBy || null,
    dyeingAcceptedByName: data.dyeingAcceptedByName || null,
    dyeingStartedAt: data.dyeingStartedAt || null,
    dyeingCompletedAt: data.dyeingCompletedAt || null,
    dyeingRejectedAt: data.dyeingRejectedAt || null,
    dyeingRejectedBy: data.dyeingRejectedBy || null,
    dyeingRejectedByName: data.dyeingRejectedByName || null,
    dyeingRejectionReasonCode: data.dyeingRejectionReasonCode || null,
    dyeingRejectionReason: data.dyeingRejectionReason || null,
    dyeingRejectionNotes: data.dyeingRejectionNotes || null,
    previousFabricationUserId: data.previousFabricationUserId || null,
    previousFabricationUserName: data.previousFabricationUserName || null,
    materials: [],
  }));

  return {
    orderItemId: item.id,
    orderId: item.order_id,
    orderNumber: order?.order_number || "",
    customerName: order?.customer_name || "",
    productName: item.product_name,
    productSku: item.product_sku,
    productImage: item.product_image,
    size: item.size,
    quantity: item.quantity,
    fwdDate: order?.fwd_date || null,
    priority: order?.urgent ? "URGENT" : null,
    status: item.status,
    sections,
    sectionStatuses: ss,
    timeline: [],
  };
}

/**
 * GET /api/dyeing/stats
 * Dashboard statistics
 */
async function getStats(userId = null) {
  const items = await OrderItem.findAll();

  let availableCount = 0;
  let acceptedCount = 0;
  let inProgressCount = 0;
  let completedTodayCount = 0;
  const today = new Date().toISOString().slice(0, 10);

  for (const item of items) {
    const ss = item.section_statuses || {};
    for (const [, v] of Object.entries(ss)) {
      if (v.status === SECTION_STATUS.READY_FOR_DYEING) {
        availableCount++;
      }
      if (v.status === SECTION_STATUS.DYEING_ACCEPTED) {
        if (!userId || v.dyeingAcceptedBy === userId) acceptedCount++;
      }
      if (v.status === SECTION_STATUS.DYEING_IN_PROGRESS) {
        if (!userId || v.dyeingAcceptedBy === userId) inProgressCount++;
      }
      if (
        v.status === SECTION_STATUS.READY_FOR_PRODUCTION &&
        v.dyeingCompletedAt &&
        v.dyeingCompletedAt.slice(0, 10) === today
      ) {
        if (!userId || v.dyeingAcceptedBy === userId) completedTodayCount++;
      }
    }
  }

  return { availableCount, acceptedCount, inProgressCount, completedTodayCount };
}

// ═══════════════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * POST /api/dyeing/task/:orderItemId/accept
 * Accept sections for dyeing
 */
async function acceptSections(orderItemId, { userId, sections }) {
  const item = await loadOrderItem(orderItemId);
  const user = await User.findByPk(userId);
  const now = new Date();
  const ss = { ...(item.section_statuses || {}) };

  // Validate all sections are READY_FOR_DYEING
  const invalid = sections.filter((s) => {
    const key = s.toLowerCase();
    return !ss[key] || ss[key].status !== SECTION_STATUS.READY_FOR_DYEING;
  });
  if (invalid.length > 0) {
    throw serviceError(
      `Sections not ready for dyeing: ${invalid.join(", ")}`,
      400,
      "SECTIONS_NOT_READY"
    );
  }

  // Check no other user already accepted sections for this order item
  const existingAssignee = Object.values(ss).find(
    (v) =>
      v.dyeingAcceptedBy &&
      v.dyeingAcceptedBy !== userId &&
      [SECTION_STATUS.DYEING_ACCEPTED, SECTION_STATUS.DYEING_IN_PROGRESS].includes(v.status)
  );
  if (existingAssignee) {
    throw serviceError(
      "Another user has already accepted tasks for this order item",
      400,
      "ALREADY_ASSIGNED"
    );
  }

  // Accept
  sections.forEach((s) => {
    const key = s.toLowerCase();
    ss[key] = {
      ...ss[key],
      status: SECTION_STATUS.DYEING_ACCEPTED,
      dyeingAcceptedAt: now.toISOString(),
      dyeingAcceptedBy: userId,
      dyeingAcceptedByName: user?.name || "Unknown",
      updatedAt: now.toISOString(),
    };
  });

  const newStatus = calculateOrderItemStatus(ss) || item.status;

  await item.update({ section_statuses: ss, status: newStatus });
  await safeUpdateOrderStatus(item.order_id, newStatus);

  // Update OrderItemSection records
  for (const s of sections) {
    await OrderItemSection.update(
      {
        status: SECTION_STATUS.DYEING_ACCEPTED,
        status_updated_at: now,
        status_updated_by: userId,
      },
      { where: { order_item_id: orderItemId, piece: { [Op.iLike]: s.toLowerCase() } } }
    );
  }

  await OrderActivity.log({
    orderId: item.order_id,
    orderItemId,
    action: `Dyeing accepted for sections: ${sections.join(", ")} by ${user?.name || "Unknown"}`,
    actionType: ACTIVITY_ACTION_TYPE.DYEING_EVENT,
    userId,
    userName: user?.name || "Unknown",
    details: { sections, action: "accept" },
  });

  const reloaded = await loadOrderItem(orderItemId);
  return { orderItem: serializeOrderItem(reloaded) };
}

/**
 * POST /api/dyeing/task/:orderItemId/start
 * Start dyeing for accepted sections
 */
async function startDyeing(orderItemId, { userId, sections }) {
  const item = await loadOrderItem(orderItemId);
  const user = await User.findByPk(userId);
  const now = new Date();
  const ss = { ...(item.section_statuses || {}) };

  // Validate: must be DYEING_ACCEPTED and belong to this user
  const invalid = sections.filter((s) => {
    const key = s.toLowerCase();
    const sec = ss[key];
    if (!sec || sec.status !== SECTION_STATUS.DYEING_ACCEPTED) return true;
    if (sec.dyeingAcceptedBy !== userId) return true;
    return false;
  });
  if (invalid.length > 0) {
    throw serviceError(`Invalid sections: ${invalid.join(", ")}`, 400, "INVALID_SECTIONS");
  }

  sections.forEach((s) => {
    const key = s.toLowerCase();
    ss[key] = {
      ...ss[key],
      status: SECTION_STATUS.DYEING_IN_PROGRESS,
      dyeingStartedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  });

  const newStatus = calculateOrderItemStatus(ss) || item.status;
  await item.update({ section_statuses: ss, status: newStatus });
  await safeUpdateOrderStatus(item.order_id, newStatus);

  for (const s of sections) {
    await OrderItemSection.update(
      { status: SECTION_STATUS.DYEING_IN_PROGRESS, status_updated_at: now, status_updated_by: userId },
      { where: { order_item_id: orderItemId, piece: { [Op.iLike]: s.toLowerCase() } } }
    );
  }

  await OrderActivity.log({
    orderId: item.order_id,
    orderItemId,
    action: `Dyeing started for sections: ${sections.join(", ")} by ${user?.name || "Unknown"}`,
    actionType: ACTIVITY_ACTION_TYPE.DYEING_EVENT,
    userId,
    userName: user?.name || "Unknown",
    details: { sections, action: "start" },
  });

  const reloaded = await loadOrderItem(orderItemId);
  return { orderItem: serializeOrderItem(reloaded) };
}

/**
 * POST /api/dyeing/task/:orderItemId/complete
 * Complete dyeing — section moves to READY_FOR_PRODUCTION
 */
async function completeDyeing(orderItemId, { userId, sections }) {
  const item = await loadOrderItem(orderItemId);
  const user = await User.findByPk(userId);
  const now = new Date();
  const ss = { ...(item.section_statuses || {}) };

  // Validate: DYEING_ACCEPTED or DYEING_IN_PROGRESS, same user
  const invalid = sections.filter((s) => {
    const key = s.toLowerCase();
    const sec = ss[key];
    if (!sec) return true;
    if (
      ![SECTION_STATUS.DYEING_ACCEPTED, SECTION_STATUS.DYEING_IN_PROGRESS].includes(sec.status)
    )
      return true;
    if (sec.dyeingAcceptedBy !== userId) return true;
    return false;
  });
  if (invalid.length > 0) {
    throw serviceError(`Invalid sections: ${invalid.join(", ")}`, 400, "INVALID_SECTIONS");
  }

  sections.forEach((s) => {
    const key = s.toLowerCase();
    ss[key] = {
      ...ss[key],
      status: SECTION_STATUS.READY_FOR_PRODUCTION,
      dyeingCompletedAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
  });

  const allReady = Object.values(ss).every(
    (v) => v.status === SECTION_STATUS.READY_FOR_PRODUCTION
  );
  const newStatus = allReady
    ? ORDER_ITEM_STATUS.READY_FOR_PRODUCTION
    : calculateOrderItemStatus(ss) || item.status;

  await item.update({ section_statuses: ss, status: newStatus });
  await safeUpdateOrderStatus(item.order_id, newStatus);

  for (const s of sections) {
    await OrderItemSection.update(
      { status: SECTION_STATUS.READY_FOR_PRODUCTION, status_updated_at: now, status_updated_by: userId },
      { where: { order_item_id: orderItemId, piece: { [Op.iLike]: s.toLowerCase() } } }
    );
  }

  await OrderActivity.log({
    orderId: item.order_id,
    orderItemId,
    action: `Dyeing completed for sections: ${sections.join(", ")}${allReady ? ". All sections ready for production." : ""}`,
    actionType: ACTIVITY_ACTION_TYPE.DYEING_EVENT,
    userId,
    userName: user?.name || "Unknown",
    details: { sections, action: "complete", allSectionsReady: allReady },
  });

  const reloaded = await loadOrderItem(orderItemId);
  return { orderItem: serializeOrderItem(reloaded), allSectionsReady: allReady };
}

/**
 * POST /api/dyeing/task/:orderItemId/reject
 * Reject sections — releases inventory, invalidates packet portion, sends
 * section back to PENDING_INVENTORY_CHECK for full re-creation loop.
 */
async function rejectSections(orderItemId, { userId, sections, reasonCode, notes }) {
  if (!notes) {
    throw serviceError("Notes are required for rejection", 400, "NOTES_REQUIRED");
  }

  const item = await loadOrderItem(orderItemId);
  const user = await User.findByPk(userId);
  const now = new Date();
  const ss = { ...(item.section_statuses || {}) };

  const rejectionLabel =
    reasonCode && DYEING_REJECTION_REASONS[reasonCode]
      ? DYEING_REJECTION_REASONS[reasonCode].label
      : "Unspecified reason";

  // Validate sections are in a dyeing state
  const invalid = sections.filter((s) => {
    const key = s.toLowerCase();
    const sec = ss[key];
    if (!sec) return true;
    return ![
      SECTION_STATUS.READY_FOR_DYEING,
      SECTION_STATUS.DYEING_ACCEPTED,
      SECTION_STATUS.DYEING_IN_PROGRESS,
    ].includes(sec.status);
  });
  if (invalid.length > 0) {
    throw serviceError(`Cannot reject sections: ${invalid.join(", ")}`, 400, "INVALID_SECTIONS");
  }

  const rejectedSections = [];
  const inventoryReleased = [];

  for (const sectionName of sections) {
    const key = sectionName.toLowerCase();
    const sectionData = ss[key];

    // Store previous fabrication user for auto-reassignment later
    const prevFabUserId = sectionData.packetCreatedBy || null;
    const prevFabUserName = sectionData.packetCreatedByName || null;

    // Reset section to PENDING_INVENTORY_CHECK
    ss[key] = {
      ...sectionData,
      status: SECTION_STATUS.PENDING_INVENTORY_CHECK,
      // Clear dyeing data
      dyeingAcceptedAt: null,
      dyeingAcceptedBy: null,
      dyeingAcceptedByName: null,
      dyeingStartedAt: null,
      dyeingCompletedAt: null,
      // Set rejection data
      dyeingRejectedAt: now.toISOString(),
      dyeingRejectedBy: userId,
      dyeingRejectedByName: user?.name || "Unknown",
      dyeingRejectionReasonCode: reasonCode || null,
      dyeingRejectionReason: rejectionLabel,
      dyeingRejectionNotes: notes,
      // Increment round
      dyeingRound: (sectionData.dyeingRound || 1) + 1,
      // Store previous fabrication user
      previousFabricationUserId: prevFabUserId,
      previousFabricationUserName: prevFabUserName,
      // Clear inventory check results
      inventoryCheckResult: null,
      updatedAt: now.toISOString(),
    };

    rejectedSections.push({
      name: sectionName,
      round: (sectionData.dyeingRound || 1) + 1,
      previousFabricationUser: prevFabUserName,
    });

    // ── Release inventory for this section ────────────────────────
    // Find inventory movements (STOCK_OUT) for this order item + section
    const movements = await InventoryMovement.findAll({
      where: {
        reference_id: orderItemId,
        reference_type: "INVENTORY_CHECK",
        movement_type: "STOCK_OUT",
        notes: { [Op.iLike]: `%section: ${key}%` },
      },
    });

    for (const mov of movements) {
      const invItem = await InventoryItem.findByPk(mov.inventory_item_id);
      if (!invItem) continue;

      const prevStock = parseFloat(invItem.remaining_stock) || 0;
      const releaseQty = parseFloat(mov.quantity) || 0;
      const newStock = prevStock + releaseQty;

      await invItem.update({ remaining_stock: newStock });

      await InventoryMovement.create({
        inventory_item_id: mov.inventory_item_id,
        movement_type: "STOCK_IN",
        quantity: releaseQty,
        remaining_after: newStock,
        reference_type: "DYEING_REJECTION",
        reference_id: orderItemId,
        notes: `Stock released from dyeing rejection. Section: ${sectionName}. Reason: ${rejectionLabel}`,
        performed_by: userId,
        transaction_date: now,
      });

      inventoryReleased.push({
        inventoryItemId: mov.inventory_item_id,
        name: invItem.name,
        quantity: releaseQty,
        section: sectionName,
        previousStock: prevStock,
        newStock,
      });
    }

    // ── Invalidate packet portion for this section ────────────────
    const packet = await Packet.findOne({ where: { order_item_id: orderItemId } });
    if (packet) {
      const included = packet.sections_included || [];
      const newIncluded = included.filter(
        (s) => s.toLowerCase() !== key
      );
      const invalidated = packet.invalidated_sections || [];
      invalidated.push({
        section: sectionName,
        invalidatedAt: now.toISOString(),
        reason: `Dyeing rejection: ${rejectionLabel}`,
      });

      const updates = {
        sections_included: newIncluded,
        invalidated_sections: invalidated,
      };
      if (newIncluded.length === 0) {
        updates.status = "INVALIDATED";
      }
      await packet.update(updates);

      // Remove packet items for this section
      await PacketItem.destroy({
        where: { packet_id: packet.id, piece: { [Op.iLike]: key } },
      });
    }

    // Update OrderItemSection record
    await OrderItemSection.update(
      {
        status: SECTION_STATUS.PENDING_INVENTORY_CHECK,
        status_updated_at: now,
        status_updated_by: userId,
      },
      { where: { order_item_id: orderItemId, piece: { [Op.iLike]: key } } }
    );
  }

  // Recalculate order item status
  const newStatus = calculateOrderItemStatus(ss) || item.status;
  await item.update({ section_statuses: ss, status: newStatus });
  await safeUpdateOrderStatus(item.order_id, newStatus);

  // Activity logs
  await OrderActivity.log({
    orderId: item.order_id,
    orderItemId,
    action: `Dyeing rejected for sections: ${sections.join(", ")}. Reason: ${rejectionLabel}. Notes: ${notes}`,
    actionType: ACTIVITY_ACTION_TYPE.DYEING_EVENT,
    userId,
    userName: user?.name || "Unknown",
    details: { sections, reasonCode, rejectionLabel, notes, action: "reject" },
  });

  if (inventoryReleased.length > 0) {
    await OrderActivity.log({
      orderId: item.order_id,
      orderItemId,
      action: `Inventory released back to stock for rejected sections: ${sections.join(", ")}`,
      actionType: ACTIVITY_ACTION_TYPE.DYEING_EVENT,
      userId: null,
      userName: "System",
      details: { inventoryReleased },
    });
  }

  const reloaded = await loadOrderItem(orderItemId);
  return {
    orderItem: serializeOrderItem(reloaded),
    rejectedSections,
    inventoryReleased,
  };
}

// ═══════════════════════════════════════════════════════════════════════
module.exports = {
  getAvailableTasks,
  getMyTasks,
  getCompletedTasks,
  getTaskDetails,
  getStats,
  acceptSections,
  startDyeing,
  completeDyeing,
  rejectSections,
};