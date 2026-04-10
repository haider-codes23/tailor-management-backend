/**
 * Notification Triggers — Phase 16B
 *
 * Centralized notification trigger functions called from other services.
 * Each function is fire-and-forget (async but not awaited) so notifications
 * never block the main workflow.
 *
 * Usage in any service:
 *   const notify = require("./notificationTriggers");
 *   notify.orderCreated(order, user);   // fire-and-forget
 */

const { NOTIFICATION_TYPES, REFERENCE_TYPES } = require("../constants/notificationTypes");

function getNotificationService() {
  return require("./notificationService");
}

// const notificationService = require("./notificationService");

// =========================================================================
// ORDER LIFECYCLE
// =========================================================================

/**
 * Order created → notify ADMIN + PRODUCTION_HEAD
 */
function orderCreated(order, createdBy) {
  const orderNum = order.order_number || order.orderNumber || "New Order";
  const customer = order.customer_name || order.customerName || "Customer";

  getNotificationService().notifyRoles("ADMIN", {
    type: NOTIFICATION_TYPES.ORDER_CREATED,
    title: "New Order Received",
    message: `${orderNum} created for ${customer}`,
    referenceType: REFERENCE_TYPES.ORDER,
    referenceId: order.id,
    actionUrl: `/orders/${order.id}`,
    metadata: { orderNumber: orderNum, customerName: customer },
  });
}

/**
 * Order cancelled → notify ADMIN + SALES
 */
function orderCancelled(order, cancelledBy) {
  const orderNum = order.order_number || order.orderNumber;

  getNotificationService().notifyRoles(["ADMIN", "SALES"], {
    type: NOTIFICATION_TYPES.ORDER_CANCELLED,
    title: "Order Cancelled",
    message: `${orderNum} has been cancelled`,
    referenceType: REFERENCE_TYPES.ORDER,
    referenceId: order.id,
    actionUrl: `/orders/${order.id}`,
    metadata: { orderNumber: orderNum },
  });
}

// =========================================================================
// PRODUCTION
// =========================================================================

/**
 * Production head assigned to an order item → notify the assigned production head
 */
function productionAssigned(assignment, orderItem) {
  const productName = orderItem?.product_name || orderItem?.productName || "Item";

  getNotificationService().notifyUser(assignment.production_head_id, {
    type: NOTIFICATION_TYPES.PRODUCTION_ASSIGNED,
    title: "Production Assignment",
    message: `You have been assigned to ${productName}`,
    referenceType: REFERENCE_TYPES.ORDER_ITEM,
    referenceId: orderItem?.id || assignment.order_item_id,
    actionUrl: "/production",
    metadata: { productName },
  });
}

/**
 * Task created and assigned to a worker → notify the worker
 */
/**
 * Task created and assigned to a worker → notify the worker
 */
function taskAssigned(task) {
  const assignedToId = task.assigned_to_id || task.assignedToId;
  if (!assignedToId) return;

  const sectionName = task.section_name || task.sectionName;
  const taskType = task.task_type || task.taskType;
  const customTaskName = task.custom_task_name || task.customTaskName;
  const orderItemId = task.order_item_id || task.orderItemId;

  getNotificationService().notifyUser(assignedToId, {
    type: NOTIFICATION_TYPES.TASK_ASSIGNED,
    title: "New Task Assigned",
    message: `${taskType || customTaskName || "Task"} for ${sectionName}`,
    referenceType: REFERENCE_TYPES.PRODUCTION_TASK,
    referenceId: task.id,
    actionUrl: "/production",
    metadata: { sectionName, taskType, orderItemId },
  });
}

/**
 * Section sent to QA → notify QA users
 */
function sectionSentToQA(orderItemId, sectionName, orderId) {
  getNotificationService().notifyRole("QA", {
    type: NOTIFICATION_TYPES.QA_REVIEW_NEEDED,
    title: "QA Review Required",
    message: `${sectionName} section is ready for QA inspection`,
    referenceType: REFERENCE_TYPES.ORDER_ITEM,
    referenceId: orderItemId,
    actionUrl: "/qa",
    metadata: { sectionName, orderItemId },
  });
}

// =========================================================================
// QA
// =========================================================================

/**
 * QA section rejected → notify PRODUCTION_HEAD
 */
function qaRejected(orderItemId, sectionName, reason) {
  getNotificationService().notifyRole("PRODUCTION_HEAD", {
    type: NOTIFICATION_TYPES.QA_REJECTED,
    title: "QA Section Rejected",
    message: `${sectionName} rejected by QA - rework needed`,
    referenceType: REFERENCE_TYPES.ORDER_ITEM,
    referenceId: orderItemId,
    actionUrl: "/production",
    metadata: { sectionName, reason },
  });
}

/**
 * Order sent to sales (video uploaded, all sections approved) → notify SALES
 */
function sentToSales(orderId, orderNumber) {
  getNotificationService().notifyRole("SALES", {
    type: NOTIFICATION_TYPES.CLIENT_APPROVAL_NEEDED,
    title: "Ready for Client Approval",
    message: `${orderNumber || "Order"} video uploaded - send to client`,
    referenceType: REFERENCE_TYPES.ORDER,
    referenceId: orderId,
    actionUrl: "/sales",
    metadata: { orderNumber },
  });
}

/**
 * Re-video uploaded by QA (after sales requested one) → notify SALES
 */
function reVideoUploaded(orderId, orderNumber) {
  getNotificationService().notifyRole("SALES", {
    type: NOTIFICATION_TYPES.CLIENT_APPROVAL_NEEDED,
    title: "Re-Video Ready",
    message: `New video uploaded for ${orderNumber || "order"} — your re-video request was fulfilled`,
    referenceType: REFERENCE_TYPES.ORDER,
    referenceId: orderId,
    actionUrl: "/sales",
    metadata: { orderNumber, isReVideo: true },
  });
}

/**
 * Re-video requested by sales → notify QA
 */
function reVideoRequested(orderId, orderNumber) {
  getNotificationService().notifyRole("QA", {
    type: NOTIFICATION_TYPES.RE_VIDEO_REQUESTED,
    title: "Re-Video Requested",
    message: `Sales requested a new video for ${orderNumber || "order"}`,
    referenceType: REFERENCE_TYPES.ORDER,
    referenceId: orderId,
    actionUrl: "/qa",
    metadata: { orderNumber },
  });
}

// =========================================================================
// SALES / CLIENT APPROVAL
// =========================================================================

/**
 * Client approved → notify DISPATCH + ADMIN
 */
function clientApproved(orderId, orderNumber) {
  getNotificationService().notifyRoles(["DISPATCH", "ADMIN"], {
    type: NOTIFICATION_TYPES.READY_FOR_DISPATCH,
    title: "Ready for Dispatch",
    message: `${orderNumber || "Order"} approved by client - ready to ship`,
    referenceType: REFERENCE_TYPES.ORDER,
    referenceId: orderId,
    actionUrl: "/dispatch",
    metadata: { orderNumber },
  });
}

/**
 * Alteration requested → notify PRODUCTION_HEAD
 */
function alterationRequested(orderId, orderNumber, sections) {
  getNotificationService().notifyRole("PRODUCTION_HEAD", {
    type: NOTIFICATION_TYPES.ALTERATION_REQUESTED,
    title: "Alteration Required",
    message: `Client requested alterations on ${orderNumber || "order"}`,
    referenceType: REFERENCE_TYPES.ORDER,
    referenceId: orderId,
    actionUrl: "/production",
    metadata: { orderNumber, sections },
  });
}

/**
 * Rework needed (client rejected specific sections) → notify PRODUCTION_HEAD
 */
function reworkNeeded(orderId, orderNumber, reason) {
  getNotificationService().notifyRole("PRODUCTION_HEAD", {
    type: NOTIFICATION_TYPES.REWORK_NEEDED,
    title: "Rework Required",
    message: `${orderNumber || "Order"} requires rework`,
    referenceType: REFERENCE_TYPES.ORDER,
    referenceId: orderId,
    actionUrl: "/production",
    metadata: { orderNumber, reason },
  });
}

// =========================================================================
// DISPATCH
// =========================================================================

/**
 * Order dispatched → notify ADMIN + SALES
 */
function orderDispatched(order, courier, trackingNumber) {
  const orderNum = order.order_number || order.orderNumber;

  getNotificationService().notifyRoles(["ADMIN", "SALES"], {
    type: NOTIFICATION_TYPES.ORDER_DISPATCHED,
    title: "Order Dispatched",
    message: `${orderNum || "Order"} dispatched via ${courier || "courier"}`,
    referenceType: REFERENCE_TYPES.ORDER,
    referenceId: order.id,
    actionUrl: `/orders/${order.id}`,
    metadata: { orderNumber: orderNum, courier, trackingNumber },
  });
}

// =========================================================================
// INVENTORY / PROCUREMENT
// =========================================================================

/**
 * Material shortage detected during inventory check → notify PURCHASER
 */
function materialShortage(orderItemId, failedSections, orderNumber) {
  getNotificationService().notifyRole("PURCHASER", {
    type: NOTIFICATION_TYPES.MATERIAL_SHORTAGE,
    title: "Material Shortage",
    message: `${orderNumber || "Order"} has material shortages: ${failedSections.join(", ")}`,
    referenceType: REFERENCE_TYPES.ORDER_ITEM,
    referenceId: orderItemId,
    actionUrl: "/procurement",
    metadata: { orderNumber, failedSections },
  });
}

// =========================================================================
// PACKET
// =========================================================================

/**
 * Packet assigned → notify the packet creator
 */
function packetAssigned(packet) {
  console.log("🔔 packetAssigned trigger called, assigned_to:", packet.assigned_to);
  if (!packet.assigned_to) return;

  getNotificationService().notifyUser(packet.assigned_to, {
    type: NOTIFICATION_TYPES.PACKET_ASSIGNED,
    title: "Packet Assigned",
    message: "Packet assigned to you for material picking",
    referenceType: REFERENCE_TYPES.PACKET,
    referenceId: packet.id,
    actionUrl: `/orders/${packet.order_id}/items/${packet.order_item_id}`,
    metadata: { packetId: packet.id },
  }).then(() => console.log("✅ Packet notification created"))
    .catch(err => console.error("❌ Packet notification failed:", err.message));
}

/**
 * Packet completed (picking done) → notify PRODUCTION_HEAD to verify
 */
function packetCompleted(packet) {
  getNotificationService().notifyRole("ADMIN", {
    type: NOTIFICATION_TYPES.PACKET_COMPLETED,
    title: "Packet Ready for Verification",
    message: `${packet.assigned_to_name || "Packet Creator"} completed picking - verify packet`,
    referenceType: REFERENCE_TYPES.PACKET,
    referenceId: packet.id,
    actionUrl: `/orders/${packet.order_id}/items/${packet.order_item_id}`,
    metadata: { packetId: packet.id, completedBy: packet.assigned_to_name },
  });
}

/**
 * Packet approved → notify the packet creator
 */
function packetApproved(packet) {
  if (!packet.assigned_to) return;

  getNotificationService().notifyUser(packet.assigned_to, {
    type: NOTIFICATION_TYPES.PACKET_COMPLETED,
    title: "Packet Approved",
    message: `Your packet has been approved by ${packet.checked_by_name || "Production Head"}`,
    referenceType: REFERENCE_TYPES.PACKET,
    referenceId: packet.id,
    actionUrl: `/orders/${packet.order_id}/items/${packet.order_item_id}`,
    metadata: { packetId: packet.id },
  });
}

/**
 * Packet rejected → notify the packet creator to redo
 */
function packetRejected(packet, reason) {
  if (!packet.assigned_to) return;

  getNotificationService().notifyUser(packet.assigned_to, {
    type: NOTIFICATION_TYPES.PACKET_REJECTED,
    title: "Packet Rejected",
    message: `Packet rejected - ${reason || "correction needed"}`,
    referenceType: REFERENCE_TYPES.PACKET,
    referenceId: packet.id,
    actionUrl: `/orders/${packet.order_id}/items/${packet.order_item_id}`,
    metadata: { packetId: packet.id, reason },
  });
}

// =========================================================================
// DYEING
// =========================================================================

/**
 * Dyeing sections accepted (claimed) by a dyeing user → notify ADMIN
 */
function dyeingAccepted(item, user, sections, orderNumber) {
  const sectionList = Array.isArray(sections) ? sections.join(", ") : sections;
  const userName = user?.name || "Dyeing User";

  getNotificationService().notifyRole("ADMIN", {
    type: NOTIFICATION_TYPES.DYEING_ACCEPTED,
    title: "Dyeing Task Claimed",
    message: `${userName} claimed ${sectionList} of ${orderNumber || "order"} for dyeing`,
    referenceType: REFERENCE_TYPES.ORDER_ITEM,
    referenceId: item.id,
    actionUrl: `/orders/${item.order_id}/items/${item.id}`,
    metadata: {
      orderItemId: item.id,
      orderId: item.order_id,
      orderNumber,
      sections,
      claimedBy: userName,
    },
  });
}

/**
 * Dyeing started on accepted sections → notify ADMIN
 */
function dyeingStarted(item, user, sections, orderNumber) {
  const sectionList = Array.isArray(sections) ? sections.join(", ") : sections;
  const userName = user?.name || "Dyeing User";

  getNotificationService().notifyRole("ADMIN", {
    type: NOTIFICATION_TYPES.DYEING_STARTED,
    title: "Dyeing Started",
    message: `${userName} started dyeing ${sectionList} of ${orderNumber || "order"}`,
    referenceType: REFERENCE_TYPES.ORDER_ITEM,
    referenceId: item.id,
    actionUrl: `/orders/${item.order_id}/items/${item.id}`,
    metadata: {
      orderItemId: item.id,
      orderId: item.order_id,
      orderNumber,
      sections,
      startedBy: userName,
    },
  });
}

/**
 * Dyeing completed on sections → notify ADMIN
 */
function dyeingCompleted(item, user, sections, orderNumber, allSectionsReady) {
  const sectionList = Array.isArray(sections) ? sections.join(", ") : sections;
  const userName = user?.name || "Dyeing User";

  const suffix = allSectionsReady ? " — all sections ready for production" : "";

  getNotificationService().notifyRole("ADMIN", {
    type: NOTIFICATION_TYPES.DYEING_COMPLETED,
    title: "Dyeing Completed",
    message: `${userName} completed dyeing ${sectionList} of ${orderNumber || "order"}${suffix}`,
    referenceType: REFERENCE_TYPES.ORDER_ITEM,
    referenceId: item.id,
    actionUrl: `/orders/${item.order_id}/items/${item.id}`,
    metadata: {
      orderItemId: item.id,
      orderId: item.order_id,
      orderNumber,
      sections,
      completedBy: userName,
      allSectionsReady,
    },
  });
}

/**
 * Dyeing rejected → notify the original packet creator (so they know their
 * packet is coming back) + ADMIN. Uses `previousFabricationUserId` that the
 * dyeing service stores on each rejected section.
 */
function dyeingRejected(item, user, rejectedSections, reason, orderNumber) {
  const userName = user?.name || "Dyeing User";
  const sectionNames = rejectedSections.map((s) => s.name).join(", ");

  // Notify admin(s) regardless
  getNotificationService().notifyRole("ADMIN", {
    type: NOTIFICATION_TYPES.DYEING_REJECTED,
    title: "Dyeing Rejected",
    message: `${sectionNames} of ${orderNumber || "order"} rejected from dyeing by ${userName} — back to packet creation`,
    referenceType: REFERENCE_TYPES.ORDER_ITEM,
    referenceId: item.id,
    actionUrl: `/orders/${item.order_id}/items/${item.id}`,
    metadata: {
      orderItemId: item.id,
      orderId: item.order_id,
      orderNumber,
      rejectedSections,
      reason,
      rejectedBy: userName,
    },
  });

  // Notify each original packet creator (deduped) so they know their work is coming back
  const prevUserIds = [
    ...new Set(
      rejectedSections
        .map((s) => s.previousFabricationUserId)
        .filter(Boolean)
    ),
  ];

  prevUserIds.forEach((prevUserId) => {
    const theirSections = rejectedSections
      .filter((s) => s.previousFabricationUserId === prevUserId)
      .map((s) => s.name)
      .join(", ");

    getNotificationService().notifyUser(prevUserId, {
      type: NOTIFICATION_TYPES.DYEING_REJECTED,
      title: "Packet Returned from Dyeing",
      message: `${theirSections} of ${orderNumber || "order"} was rejected at dyeing — ${reason || "check notes"}. Packet needs to be recreated.`,
      referenceType: REFERENCE_TYPES.ORDER_ITEM,
      referenceId: item.id,
      actionUrl: `/orders/${item.order_id}/items/${item.id}`,
      metadata: {
        orderItemId: item.id,
        orderId: item.order_id,
        orderNumber,
        sections: theirSections,
        reason,
        rejectedBy: userName,
      },
    });
  });
}

/**
 * Sections are ready for dyeing (packet approved) → notify all DYEING users
 */
function dyeingRequired(item, sections, orderNumber) {
  const sectionList = Array.isArray(sections) ? sections.join(", ") : sections;

  getNotificationService().notifyRole("DYEING", {
    type: NOTIFICATION_TYPES.DYEING_REQUIRED,
    title: "New Dyeing Task Available",
    message: `${sectionList} of ${orderNumber || "order"} is ready for dyeing`,
    referenceType: REFERENCE_TYPES.ORDER_ITEM,
    referenceId: item.id,
    actionUrl: "/dyeing",
    metadata: {
      orderItemId: item.id,
      orderId: item.order_id,
      orderNumber,
      sections,
    },
  });
}

// =========================================================================
// EXPORTS
// =========================================================================

module.exports = {
  orderCreated,
  orderCancelled,
  productionAssigned,
  taskAssigned,
  sectionSentToQA,
  qaRejected,
  sentToSales,
  reVideoRequested,
  clientApproved,
  alterationRequested,
  reworkNeeded,
  orderDispatched,
  materialShortage,
  packetAssigned,
  packetCompleted,
  packetApproved,
  packetRejected,
  dyeingAccepted,
  dyeingStarted,
  dyeingCompleted,
  dyeingRejected,
  dyeingRequired,
  reVideoRequested,
  reVideoUploaded,
};