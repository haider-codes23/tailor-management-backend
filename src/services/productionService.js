/**
 * Production Service — Phase 12
 *
 * Manages: round-robin assignment, task creation per section,
 * worker task execution, section completion → QA handoff.
 *
 * Two DB tables: production_assignments, production_tasks
 * Plus updates to order_items.section_statuses JSONB & order_item_sections.
 */

const { Op } = require("sequelize");
const {
  Order,
  OrderItem,
  OrderItemSection,
  OrderActivity,
  User,
  ProductionTask,
  ProductionAssignment,
} = require("../models");

const {
  ORDER_ITEM_STATUS,
  SECTION_STATUS,
  ACTIVITY_ACTION_TYPE,
  ORDER_STATUS_VALUES,
} = require("../constants/order");

const notify = require("./notificationTriggers");

// ── Production task statuses (mirrors frontend constants) ─────────────
const TASK_STATUS = {
  PENDING: "PENDING",
  READY: "READY",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
};

// ── Helpers ────────────────────────────────────────────────────────────

function serviceError(msg, status, code) {
  const err = new Error(msg);
  err.status = status;
  err.code = code;
  return err;
}

async function safeUpdateOrderStatus(orderId, newStatus) {
  if (newStatus && ORDER_STATUS_VALUES.includes(newStatus)) {
    await Order.update({ status: newStatus }, { where: { id: orderId } });
  }
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Serialize a ProductionTask row to camelCase for frontend */
function serializeTask(t) {
  if (!t) return null;
  const plain = t.toJSON ? t.toJSON() : t;
  return {
    id: plain.id,
    orderItemId: plain.order_item_id,
    sectionName: plain.section_name,
    taskType: plain.task_type,
    customTaskName: plain.custom_task_name,
    sequenceOrder: plain.sequence_order,
    notes: plain.notes,
    assignedToId: plain.assigned_to_id,
    assignedToName: plain.assigned_to_name,
    assignedAt: plain.assigned_at,
    assignedBy: plain.assigned_by,
    assignedByName: plain.assigned_by_name,
    status: plain.status,
    startedAt: plain.started_at,
    completedAt: plain.completed_at,
    duration: plain.duration,
    createdAt: plain.created_at,
    updatedAt: plain.updated_at,
  };
}

// =========================================================================
// 1. ROUND-ROBIN STATE
// =========================================================================

/**
 * In-memory round-robin index.
 * For production-grade, this would be persisted in a settings table.
 */
let roundRobinIndex = -1;

async function getProductionHeads() {
  return User.findAll({
    where: {
      role: { [Op.in]: ["PRODUCTION_HEAD"] },
      is_active: true,
    },
    attributes: ["id", "name", "email"],
    order: [["name", "ASC"]],
  });
}

async function getRoundRobinState() {
  const heads = await getProductionHeads();
  const nextIndex = heads.length > 0 ? (roundRobinIndex + 1) % heads.length : -1;
  const nextHead = nextIndex >= 0 ? heads[nextIndex] : null;

  const inProductionCount = await OrderItem.count({
    where: {
      status: { [Op.in]: [ORDER_ITEM_STATUS.IN_PRODUCTION, ORDER_ITEM_STATUS.PARTIAL_IN_PRODUCTION] },
    },
  });

  return {
    lastAssignedIndex: roundRobinIndex,
    productionHeadIds: heads.map((h) => h.id),
    productionHeads: heads.map((h) => ({ id: h.id, name: h.name })),
    nextProductionHead: nextHead ? { id: nextHead.id, name: nextHead.name } : null,
    totalProductionHeads: heads.length,
    stats: {
      inProduction: inProductionCount,
      completedToday: 0,
    },
    updatedAt: new Date().toISOString(),
  };
}

// =========================================================================
// 2. READY FOR ASSIGNMENT
// =========================================================================

async function getReadyForAssignment() {
  // Order items with at least one section READY_FOR_PRODUCTION
  // that don't already have a production assignment
  const assignedItemIds = (
    await ProductionAssignment.findAll({
      attributes: ["order_item_id"],
      raw: true,
    })
  ).map((a) => a.order_item_id);

  const whereClause = {
    status: {
      [Op.in]: [
        ORDER_ITEM_STATUS.READY_FOR_PRODUCTION,
        ORDER_ITEM_STATUS.DYEING_COMPLETED,
        ORDER_ITEM_STATUS.PARTIAL_IN_PRODUCTION,
      ],
    },
  };
  if (assignedItemIds.length > 0) {
    whereClause.id = { [Op.notIn]: assignedItemIds };
  }

  const items = await OrderItem.findAll({
    where: whereClause,
    include: [
      {
        model: Order,
        as: "order",
        attributes: ["id", "order_number", "customer_name", "fwd_date", "urgent"],
      },
    ],
    order: [["created_at", "ASC"]],
  });

  const heads = await getProductionHeads();
  const nextIndex = heads.length > 0 ? (roundRobinIndex + 1) % heads.length : -1;
  const nextHead = nextIndex >= 0 ? heads[nextIndex] : null;

  const readyItems = items.map((item) => {
    const ss = item.section_statuses || {};
    const readySections = Object.entries(ss)
      .filter(
        ([, v]) =>
          v.status === SECTION_STATUS.READY_FOR_PRODUCTION ||
          v.status === SECTION_STATUS.DYEING_COMPLETED
      )
      .map(([k, v]) => ({
        name: capitalize(k),
        status: v.status,
      }));

    return {
      id: item.id,
      orderItemId: item.id,
      orderId: item.order_id,
      orderNumber: item.order?.order_number || "",
      productId: item.product_id,
      productName: item.product_name,
      productImage: item.product_image,
      customerName: item.order?.customer_name || "N/A",
      fwdDate: item.order?.fwd_date || null,
      status: item.status,
      readySections: readySections.map((s) => s.name),
      sections: readySections,
      totalSections: Object.keys(ss).length,
      createdAt: item.created_at,
    };
  });

  return {
    items: readyItems,
    nextProductionHead: nextHead ? { id: nextHead.id, name: nextHead.name } : null,
    total: readyItems.length,
  };
}

// =========================================================================
// 3. ASSIGN PRODUCTION HEAD
// =========================================================================

async function assignProductionHead(orderItemId, { assignedBy }) {
  const item = await OrderItem.findByPk(orderItemId);
  if (!item) throw serviceError("Order item not found", 404, "NOT_FOUND");

  const existing = await ProductionAssignment.findOne({ where: { order_item_id: orderItemId } });
  if (existing) {
    throw serviceError("Order item already has a production head assigned", 400, "ALREADY_ASSIGNED");
  }

  const heads = await getProductionHeads();
  if (heads.length === 0) {
    throw serviceError("No active production heads available", 400, "NO_HEADS");
  }

  const nextIndex = (roundRobinIndex + 1) % heads.length;
  const assignedHead = heads[nextIndex];
  roundRobinIndex = nextIndex;

  const assigner = assignedBy ? await User.findByPk(assignedBy, { attributes: ["id", "name"] }) : null;
  const now = new Date();

  const assignment = await ProductionAssignment.create({
    order_item_id: orderItemId,
    production_head_id: assignedHead.id,
    production_head_name: assignedHead.name,
    assigned_at: now,
    assigned_by: assignedBy || null,
    assigned_by_name: assigner?.name || "System",
  });

  notify.productionAssigned(assignment, item);

  await OrderActivity.log({
    orderId: item.order_id,
    orderItemId,
    action: `Production head assigned: ${assignedHead.name}`,
    actionType: ACTIVITY_ACTION_TYPE.STATUS_CHANGE,
    userId: assignedBy || null,
    userName: assigner?.name || "System",
    details: { productionHeadId: assignedHead.id },
  });



  // Next head after this assignment
  const nextNextIndex = (roundRobinIndex + 1) % heads.length;
  const nextHead = heads[nextNextIndex];

  return {
    assignment: {
      id: assignment.id,
      orderItemId: assignment.order_item_id,
      productionHeadId: assignment.production_head_id,
      productionHeadName: assignment.production_head_name,
      assignedAt: assignment.assigned_at,
      assignedBy: assignment.assigned_by,
      productionStartedAt: null,
    },
    nextProductionHead: nextHead ? { id: nextHead.id, name: nextHead.name } : null,
    message: `Production head ${assignedHead.name} assigned successfully`,
  };
}

// =========================================================================
// 4. MY ASSIGNMENTS (Production Head Dashboard)
// =========================================================================

async function getMyAssignments(userId, userRole) {
  const whereClause = {};
  // If not admin, only show this user's assignments
  if (userRole !== "ADMIN") {
    whereClause.production_head_id = userId;
  }

  const assignments = await ProductionAssignment.findAll({
    where: whereClause,
    order: [["assigned_at", "DESC"]],
  });

  const results = [];
  for (const a of assignments) {
    const item = await OrderItem.findByPk(a.order_item_id);
    if (!item) continue;

    const order = await Order.findByPk(item.order_id, {
      attributes: ["id", "order_number", "customer_name", "fwd_date"],
    });

    const ss = item.section_statuses || {};
    const sections = Object.entries(ss).map(([key, value]) => ({
      name: capitalize(key),
      status: value.status,
      ...value,
    }));

    // Count tasks per section
    const sectionsWithCounts = [];
    for (const sec of sections) {
      // If section is pending alteration rework, reset task counts
      if (sec.isAlteration && sec.status === SECTION_STATUS.READY_FOR_PRODUCTION) {
        sectionsWithCounts.push({ ...sec, tasksCount: 0, completedTasks: 0 });
        continue;
      }
      const taskCount = await ProductionTask.count({
        where: { order_item_id: a.order_item_id, section_name: { [Op.iLike]: sec.name } },
      });
      const completedCount = await ProductionTask.count({
        where: {
          order_item_id: a.order_item_id,
          section_name: { [Op.iLike]: sec.name },
          status: TASK_STATUS.COMPLETED,
        },
      });
      sectionsWithCounts.push({ ...sec, tasksCount: taskCount, completedTasks: completedCount });
    }

    results.push({
      id: item.id,
      orderId: item.order_id,
      orderNumber: order?.order_number || "",
      productName: item.product_name,
      productImage: item.product_image,
      customerName: order?.customer_name || "",
      fwdDate: order?.fwd_date || null,
      status: item.status,
      sections: sectionsWithCounts,
      assignment: {
        productionHeadId: a.production_head_id,
        productionHeadName: a.production_head_name,
        assignedAt: a.assigned_at,
        productionStartedAt: a.production_started_at,
      },
    });
  }

  return results;
}

// =========================================================================
// 5. ORDER ITEM DETAILS (for production)
// =========================================================================

async function getOrderItemDetails(orderItemId) {
  const item = await OrderItem.findByPk(orderItemId);
  if (!item) throw serviceError("Order item not found", 404, "NOT_FOUND");

    const order = await Order.findByPk(item.order_id, {
    attributes: [
      "id",
      "order_number",
      "customer_name",
      "destination",
      "client_height",
      "shipping_address",
      "fwd_date",
      "production_shipping_date",
      "urgent",
      "notes",
      "created_at",
    ],
  });

  const assignment = await ProductionAssignment.findOne({
    where: { order_item_id: orderItemId },
  });

  // ── Sections from JSONB ────────────────────────────────────────────
  const ss = item.section_statuses || {};
  const sections = Object.entries(ss).map(([key, value]) => ({
    name: capitalize(key),
    status: value.status,
    ...value,
  }));

  // ── Order form snapshot is the source of truth for approved data ──
  // (captured at form generation and preserved through the workflow)
  const form = item.order_form || {};

  // Size classification
  const sizeType = (item.size_type || "").toUpperCase();
  const isCustomSize = sizeType === "CUSTOM";

  // Customizations — always return objects so FE can render type/details/image
  const style = item.style || form.style || { type: "original", details: null, image: null };
  const color = item.color || form.color || { type: "original", details: null, image: null };
  const fabric = item.fabric || form.fabric || { type: "original", details: null, image: null };

  // Measurements — prefer the snapshot on the form, fall back to the live JSONB
  const standardSizeChart =
    form.standardSizeChart && Object.keys(form.standardSizeChart).length > 0
      ? form.standardSizeChart
      : null;
  const heightChart =
    form.heightChart && Object.keys(form.heightChart).length > 0 ? form.heightChart : null;
  const customMeasurements =
    isCustomSize && item.measurements && Object.keys(item.measurements).length > 0
      ? item.measurements
      : form.measurements && Object.keys(form.measurements).length > 0
        ? form.measurements
        : null;

  return {
    id: item.id,
    orderId: item.order_id,
    orderNumber: order?.order_number || "",
    status: item.status,

    // Product
    productName: item.product_name,
    productImage: item.product_image,
    sku: item.product_sku,
    quantity: item.quantity,

    // Client & team
    customerName: order?.customer_name || "",
    destination: order?.destination || form.destination || null,
    customerHeight: order?.client_height || null,
    modesty: item.modesty || form.modesty || null,
    shippingAddress: order?.shipping_address || null,

    // Dates
    fwdDate: order?.fwd_date || null,
    productionShipDate: order?.production_shipping_date || null,
    orderDate: order?.created_at || null,
    urgent: order?.urgent || null,

    // Size & measurements
    sizeType: isCustomSize ? "Custom" : "Standard",
    isCustomSize,
    size: item.size || null,
    standardSizeChart, // object keyed by measurement name -> inches, or null
    heightChart,       // same shape, or null
    measurements: customMeasurements, // for custom-size items

    // Customizations — full objects (type, details, image)
    style,
    color,
    fabric,

    // What's included / add-ons — keep full objects so FE can show price
    includedItems: item.included_items || [],
    selectedAddOns: item.selected_add_ons || [],

    // Sections (workflow state)
    sections,

    // Sketch & notes
    sketchImage: form.sketchImage || null,
    notes: item.notes || form.notes || order?.notes || "",

    // Assignment
    assignment: assignment
      ? {
          productionHeadId: assignment.production_head_id,
          productionHeadName: assignment.production_head_name,
          assignedAt: assignment.assigned_at,
          productionStartedAt: assignment.production_started_at,
        }
      : null,
  };
}
// =========================================================================
// 6. GET WORKERS
// =========================================================================

async function getWorkers() {
  const workers = await User.findAll({
    where: {
      role: { [Op.in]: ["WORKER", "PRODUCTION_HEAD", "ADMIN"] },
      is_active: true,
    },
    attributes: ["id", "name", "email", "phone"],
    order: [["name", "ASC"]],
  });

  return workers.map((w) => ({
    id: w.id,
    name: w.name,
    email: w.email,
    phone: w.phone,
  }));
}

// =========================================================================
// 7. CREATE SECTION TASKS (bulk)
// =========================================================================

async function createSectionTasks(orderItemId, sectionName, { tasks, notes, userId }) {
  const item = await OrderItem.findByPk(orderItemId);
  if (!item) throw serviceError("Order item not found", 404, "NOT_FOUND");

  const sectionKey = sectionName.toLowerCase();
  const ss = item.section_statuses || {};

  if (!ss[sectionKey]) {
    throw serviceError("Section not found", 404, "SECTION_NOT_FOUND");
  }

  const now = new Date();
  const user = userId ? await User.findByPk(userId, { attributes: ["id", "name"] }) : null;

  // ── Handle rework: if QA_REJECTED or isAlteration, delete old tasks ──
  const sectionData = ss[sectionKey];
  if (sectionData.status === SECTION_STATUS.QA_REJECTED || sectionData.isAlteration) {
    await ProductionTask.destroy({
      where: {
        order_item_id: orderItemId,
        section_name: { [Op.iLike]: sectionName },
      },
    });

    // Clear alteration flag
    if (sectionData.isAlteration) {
      delete ss[sectionKey].isAlteration;
    }

    // Reset section status to READY_FOR_PRODUCTION
    ss[sectionKey].status = SECTION_STATUS.READY_FOR_PRODUCTION;
    ss[sectionKey].reworkStartedAt = now.toISOString();
    ss[sectionKey].updatedAt = now.toISOString();

    item.changed("section_statuses", true);
    await item.update({ section_statuses: { ...ss } });

    await OrderActivity.log({
      orderId: item.order_id,
      orderItemId,
      action: `Rework tasks created for ${sectionName} (Round ${sectionData.qaData?.currentRound || 2})`,
      actionType: ACTIVITY_ACTION_TYPE.STATUS_CHANGE,
      userId: userId || null,
      userName: user?.name || "Production Head",
      details: { rework: true },
    });
  }

  // ── Create tasks ──
  const createdTasks = [];
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const worker = t.workerId
      ? await User.findByPk(t.workerId, { attributes: ["id", "name"] })
      : null;

    const task = await ProductionTask.create({
      order_item_id: orderItemId,
      section_name: capitalize(sectionName),
      task_type: t.taskType,
      custom_task_name: t.customTaskName || null,
      sequence_order: t.sequenceOrder || i + 1,
      notes: notes || "",
      assigned_to_id: t.workerId || null,
      assigned_to_name: worker?.name || "Unknown",
      assigned_at: now,
      assigned_by: userId || null,
      assigned_by_name: user?.name || "Production Head",
      // First task is READY, rest are PENDING
      status: i === 0 ? TASK_STATUS.READY : TASK_STATUS.PENDING,
    });

    createdTasks.push(serializeTask(task));
  }

  // Notify assigned workers
  createdTasks.forEach((t) => notify.taskAssigned(t));

  return {
    tasks: createdTasks,
    count: createdTasks.length,
    message: `${createdTasks.length} tasks created for ${sectionName} section`,
  };
}

// =========================================================================
// 8. GET SECTION TASKS
// =========================================================================

async function getSectionTasks(orderItemId, sectionName) {
  const item = await OrderItem.findByPk(orderItemId);
  if (!item) throw serviceError("Order item not found", 404, "NOT_FOUND");

  const sectionKey = sectionName.toLowerCase();
  const ss = item.section_statuses || {};
  const sectionData = ss[sectionKey];

  // If section is pending alteration rework, return empty (old tasks hidden)
  if (sectionData?.isAlteration && sectionData?.status === SECTION_STATUS.READY_FOR_PRODUCTION) {
    return { tasks: [], count: 0 };
  }

  const tasks = await ProductionTask.findAll({
    where: {
      order_item_id: orderItemId,
      section_name: { [Op.iLike]: sectionName },
    },
    order: [["sequence_order", "ASC"]],
  });

  return {
    tasks: tasks.map(serializeTask),
    count: tasks.length,
  };
}

// =========================================================================
// 9. START SECTION PRODUCTION
// =========================================================================

async function startSectionProduction(orderItemId, sectionName, { userId }) {
  const item = await OrderItem.findByPk(orderItemId);
  if (!item) throw serviceError("Order item not found", 404, "NOT_FOUND");

  const sectionKey = sectionName.toLowerCase();
  const ss = item.section_statuses || {};

  if (!ss[sectionKey]) throw serviceError("Section not found", 404, "SECTION_NOT_FOUND");

  const now = new Date();
  const user = userId ? await User.findByPk(userId, { attributes: ["id", "name"] }) : null;

  // Update section status
  ss[sectionKey].status = SECTION_STATUS.IN_PRODUCTION;
  ss[sectionKey].productionStartedAt = now.toISOString();
  ss[sectionKey].updatedAt = now.toISOString();

  // Calculate order item status
  const allSections = Object.values(ss);
  const hasInProd = allSections.some((s) => s.status === SECTION_STATUS.IN_PRODUCTION);
  const allInProd = allSections.every(
    (s) =>
      s.status === SECTION_STATUS.IN_PRODUCTION ||
      s.status === SECTION_STATUS.PRODUCTION_COMPLETED
  );

  let newStatus = item.status;
  if (allInProd) {
    newStatus = ORDER_ITEM_STATUS.IN_PRODUCTION;
  } else if (hasInProd) {
    newStatus = ORDER_ITEM_STATUS.PARTIAL_IN_PRODUCTION;
  }

  item.changed("section_statuses", true);
  await item.update({ section_statuses: { ...ss }, status: newStatus });
  await safeUpdateOrderStatus(item.order_id, newStatus);

  // Update OrderItemSection
  await OrderItemSection.update(
    { status: SECTION_STATUS.IN_PRODUCTION, status_updated_at: now, status_updated_by: userId },
    { where: { order_item_id: orderItemId, piece: { [Op.iLike]: sectionKey } } }
  );

  // Update assignment's productionStartedAt
  await ProductionAssignment.update(
    { production_started_at: now },
    {
      where: {
        order_item_id: orderItemId,
        production_started_at: null,
      },
    }
  );

  await OrderActivity.log({
    orderId: item.order_id,
    orderItemId,
    action: `Production started for ${sectionName} section`,
    actionType: ACTIVITY_ACTION_TYPE.STATUS_CHANGE,
    userId: userId || null,
    userName: user?.name || "Production Head",
    details: { sectionName },
  });

  return { message: `Production started for ${sectionName}` };
}

// =========================================================================
// 10. WORKER TASKS
// =========================================================================

async function getWorkerTasks(userId, userRole) {
  if (!userId) return [];

  const whereClause = {};
  if (userRole === "WORKER") {
    whereClause.assigned_to_id = userId;
  }

  const tasks = await ProductionTask.findAll({
    where: whereClause,
    order: [["created_at", "DESC"]],
  });

  const enriched = [];
  for (const task of tasks) {
    const item = await OrderItem.findByPk(task.order_item_id, {
      attributes: ["id", "order_id", "product_name", "product_image"],
    });
    const order = item
      ? await Order.findByPk(item.order_id, {
          attributes: ["order_number", "fwd_date"],
        })
      : null;

    // Find blocking task
    let blockingTask = null;
    if (task.status === TASK_STATUS.PENDING) {
      const prevTask = await ProductionTask.findOne({
        where: {
          order_item_id: task.order_item_id,
          section_name: task.section_name,
          sequence_order: { [Op.lt]: task.sequence_order },
          status: { [Op.ne]: TASK_STATUS.COMPLETED },
        },
        order: [["sequence_order", "DESC"]],
      });

      if (prevTask) {
        blockingTask = {
          taskId: prevTask.id,
          taskName:
            prevTask.task_type === "CUSTOM"
              ? prevTask.custom_task_name
              : prevTask.task_type,
          status: prevTask.status,
          workerName: prevTask.assigned_to_name,
        };
      }
    }

    const serialized = serializeTask(task);
    serialized.orderNumber = order?.order_number || "";
    serialized.productName = item?.product_name || "";
    serialized.productImage = item?.product_image || "";
    serialized.fwdDate = order?.fwd_date || null;
    serialized.blockingTask = blockingTask;

    enriched.push(serialized);
  }

  return enriched;
}

// =========================================================================
// 11. START TASK
// =========================================================================

async function startTask(taskId) {
  const task = await ProductionTask.findByPk(taskId);
  if (!task) throw serviceError("Task not found", 404, "TASK_NOT_FOUND");

  if (task.status !== TASK_STATUS.READY) {
    throw serviceError("Task cannot be started. Status must be READY.", 400, "INVALID_STATUS");
  }

  const now = new Date();
  await task.update({ status: TASK_STATUS.IN_PROGRESS, started_at: now });

  return serializeTask(await ProductionTask.findByPk(taskId));
}

// =========================================================================
// 12. COMPLETE TASK
// =========================================================================

async function completeTask(taskId) {
  const task = await ProductionTask.findByPk(taskId);
  if (!task) throw serviceError("Task not found", 404, "TASK_NOT_FOUND");

  if (task.status !== TASK_STATUS.IN_PROGRESS) {
    throw serviceError("Task cannot be completed. Must be IN_PROGRESS.", 400, "INVALID_STATUS");
  }

  const now = new Date();
  const startTime = new Date(task.started_at);
  const durationMinutes = Math.round((now - startTime) / (1000 * 60));

  await task.update({
    status: TASK_STATUS.COMPLETED,
    completed_at: now,
    duration: durationMinutes,
  });

  // Mark next task as READY
  const nextTask = await ProductionTask.findOne({
    where: {
      order_item_id: task.order_item_id,
      section_name: task.section_name,
      sequence_order: task.sequence_order + 1,
    },
  });
  if (nextTask) {
    await nextTask.update({ status: TASK_STATUS.READY });
  }

  // Check if all tasks for this section are complete
  const sectionTasks = await ProductionTask.findAll({
    where: {
      order_item_id: task.order_item_id,
      section_name: task.section_name,
    },
  });
  const allComplete = sectionTasks.every((t) => t.status === TASK_STATUS.COMPLETED);

  if (allComplete) {
    // Update section → PRODUCTION_COMPLETED
    const item = await OrderItem.findByPk(task.order_item_id);
    if (item) {
      const ss = item.section_statuses || {};
      const sectionKey = task.section_name.toLowerCase();

      if (ss[sectionKey]) {
        if (!ss[sectionKey].productionStartedAt) {
          ss[sectionKey].productionStartedAt = task.started_at || now.toISOString();
        }
        ss[sectionKey].status = SECTION_STATUS.PRODUCTION_COMPLETED;
        ss[sectionKey].productionCompletedAt = now.toISOString();
        ss[sectionKey].updatedAt = now.toISOString();
      }

      // Check if ALL sections are PRODUCTION_COMPLETED
      const allSectionsComplete = Object.values(ss).every(
        (s) => s.status === SECTION_STATUS.PRODUCTION_COMPLETED
      );

      const newStatus = allSectionsComplete
        ? ORDER_ITEM_STATUS.PRODUCTION_COMPLETED
        : item.status;

      item.changed("section_statuses", true);
  await item.update({ section_statuses: { ...ss }, status: newStatus });
      await safeUpdateOrderStatus(item.order_id, newStatus);

      // Update OrderItemSection
      await OrderItemSection.update(
        { status: SECTION_STATUS.PRODUCTION_COMPLETED, status_updated_at: now },
        { where: { order_item_id: task.order_item_id, piece: { [Op.iLike]: sectionKey } } }
      );

      await OrderActivity.log({
        orderId: item.order_id,
        orderItemId: item.id,
        action: `Production completed for ${task.section_name} section${allSectionsComplete ? " - All sections complete!" : ""}`,
        actionType: ACTIVITY_ACTION_TYPE.STATUS_CHANGE,
        userId: task.assigned_to_id,
        userName: task.assigned_to_name,
        details: { sectionName: task.section_name, allComplete: allSectionsComplete },
      });
    }
  }

  const updated = await ProductionTask.findByPk(taskId);
  return {
    ...serializeTask(updated),
    allComplete,
    message: `Task completed${allComplete ? ` - ${task.section_name} section production finished!` : ""}`,
  };
}

// =========================================================================
// 13. SECTION TIMELINE
// =========================================================================

async function getSectionTimeline(orderItemId, sectionName) {
  const tasks = await ProductionTask.findAll({
    where: {
      order_item_id: orderItemId,
      section_name: { [Op.iLike]: sectionName },
    },
    order: [["sequence_order", "ASC"]],
  });

  const item = await OrderItem.findByPk(orderItemId);
  const sectionKey = sectionName.toLowerCase();
  const sectionData = item?.section_statuses?.[sectionKey];

  return {
    sectionName,
    status: sectionData?.status || null,
    tasks: tasks.map(serializeTask),
    productionStartedAt: sectionData?.productionStartedAt || null,
  };
}

// =========================================================================
// 14. SEND SECTION TO QA
// =========================================================================

async function sendSectionToQA(orderItemId, sectionName, { userId }) {
  const item = await OrderItem.findByPk(orderItemId);
  if (!item) throw serviceError("Order item not found", 404, "NOT_FOUND");

  const sectionKey = sectionName.toLowerCase();
  const ss = item.section_statuses || {};

  if (!ss[sectionKey]) throw serviceError("Section not found", 404, "SECTION_NOT_FOUND");

  if (ss[sectionKey].status !== SECTION_STATUS.PRODUCTION_COMPLETED) {
    throw serviceError(
      "Section must be PRODUCTION_COMPLETED to send to QA",
      400,
      "INVALID_STATUS"
    );
  }

  const now = new Date();
  const user = userId ? await User.findByPk(userId, { attributes: ["id", "name"] }) : null;

  ss[sectionKey].status = SECTION_STATUS.QA_PENDING;
  ss[sectionKey].sentToQAAt = now.toISOString();
  ss[sectionKey].updatedAt = now.toISOString();

  // Check if all sections in QA
  const allInQA = Object.values(ss).every(
    (s) => s.status === SECTION_STATUS.QA_PENDING || s.status === SECTION_STATUS.QA_APPROVED
  );

  const newStatus = allInQA ? ORDER_ITEM_STATUS.QUALITY_ASSURANCE : item.status;

  // Force Sequelize to detect JSONB change by spreading into new object
  item.changed("section_statuses", true);
  await item.update({ section_statuses: { ...ss }, status: newStatus });
  await safeUpdateOrderStatus(item.order_id, newStatus);

  // Update OrderItemSection
  await OrderItemSection.update(
    { status: SECTION_STATUS.QA_PENDING, status_updated_at: now, status_updated_by: userId },
    { where: { order_item_id: orderItemId, piece: { [Op.iLike]: sectionKey } } }
  );

  await OrderActivity.log({
    orderId: item.order_id,
    orderItemId,
    action: `${sectionName} section sent to QA${allInQA ? " - All sections now in QA" : ""}`,
    actionType: ACTIVITY_ACTION_TYPE.STATUS_CHANGE,
    userId: userId || null,
    userName: user?.name || "Production Head",
    details: { sectionName, allInQA },
  });

  notify.sectionSentToQA(orderItemId, sectionName, item.order_id);

  return {
    message: `${sectionName} sent to QA${allInQA ? " - All sections now in QA" : ""}`,
  };
}

// =========================================================================
// EXPORTS
// =========================================================================

module.exports = {
  getRoundRobinState,
  getReadyForAssignment,
  assignProductionHead,
  getMyAssignments,
  getOrderItemDetails,
  getWorkers,
  createSectionTasks,
  getSectionTasks,
  startSectionProduction,
  getWorkerTasks,
  startTask,
  completeTask,
  getSectionTimeline,
  sendSectionToQA,
};