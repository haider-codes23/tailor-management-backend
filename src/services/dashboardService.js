/**
 * Dashboard Service — Phase 17
 *
 * Aggregation queries for the Admin Dashboard.
 * All functions return shapes designed to feed directly into recharts widgets.
 *
 * Functions:
 *   A. getOrderFunnel       — Order counts by status (pipeline view)
 *   B. getProductionPipeline — Order item counts bucketed by production stage
 *   C. getInventoryAlerts   — Low stock, out of stock, open procurement
 *   D. getQAMetrics         — Approval/rejection rates this month
 *   E. getSalesSummary      — Per-salesperson revenue & order counts
 *   F. getRecentActivity    — Last 20 activities across all orders
 */

const { Op, fn, col, literal } = require("sequelize");
const {
  sequelize,
  Order,
  OrderItem,
  OrderItemSection,
  OrderActivity,
  InventoryItem,
  InventoryItemVariant,
  ProcurementDemand,
  User,
} = require("../models");
const { ORDER_STATUS } = require("../constants/order");

// =========================================================================
// Helpers
// =========================================================================

/** First day of the current calendar month (server time) */
function startOfThisMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

/** First day of the previous calendar month */
function startOfLastMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 1, 1, 0, 0, 0, 0);
}

/** End of last month = start of this month */
function endOfLastMonth() {
  return startOfThisMonth();
}

// =========================================================================
// A. ORDER FUNNEL
// =========================================================================

/**
 * Returns order counts grouped by status, ordered by the natural pipeline.
 * Cancelled orders are returned separately, not in the funnel itself.
 */
async function getOrderFunnel() {
  const rows = await Order.findAll({
    attributes: ["status", [fn("COUNT", col("id")), "count"]],
    group: ["status"],
    raw: true,
  });

  // Map status → count
  const countMap = {};
  rows.forEach((r) => {
    countMap[r.status] = parseInt(r.count, 10) || 0;
  });

  // Natural pipeline order (skip CANCELLED — returned separately)
  const pipeline = [
    { status: ORDER_STATUS.RECEIVED, label: "Received" },
    { status: ORDER_STATUS.INVENTORY_CHECK, label: "Inventory Check" },
    { status: ORDER_STATUS.AWAITING_MATERIAL, label: "Awaiting Material" },
    { status: ORDER_STATUS.READY_FOR_PRODUCTION, label: "Ready for Production" },
    { status: ORDER_STATUS.IN_PRODUCTION, label: "In Production" },
    { status: ORDER_STATUS.PRODUCTION_COMPLETED, label: "Production Done" },
    { status: ORDER_STATUS.AWAITING_CLIENT_APPROVAL, label: "Awaiting Approval" },
    { status: ORDER_STATUS.CLIENT_APPROVED, label: "Client Approved" },
    { status: ORDER_STATUS.READY_FOR_DISPATCH, label: "Ready for Dispatch" },
    { status: ORDER_STATUS.DISPATCHED, label: "Dispatched" },
    { status: ORDER_STATUS.COMPLETED, label: "Completed" },
  ];

  const funnel = pipeline.map((p) => ({
    status: p.status,
    label: p.label,
    count: countMap[p.status] || 0,
  }));

  const cancelledCount = countMap[ORDER_STATUS.CANCELLED] || 0;
  const totalActive = funnel.reduce((sum, f) => sum + f.count, 0);

  return {
    funnel,
    cancelledCount,
    totalActive,
  };
}

// =========================================================================
// B. PRODUCTION PIPELINE
// =========================================================================

/**
 * Bucket order items into production stages.
 * Uses OrderItem.status (item-level rollup), excluding CANCELLED & COMPLETED.
 */
async function getProductionPipeline() {
  const rows = await OrderItem.findAll({
    attributes: ["status", [fn("COUNT", col("id")), "count"]],
    where: {
      status: {
        [Op.notIn]: ["CANCELLED", "COMPLETED", "RECEIVED"],
      },
    },
    group: ["status"],
    raw: true,
  });

  const countMap = {};
  rows.forEach((r) => {
    countMap[r.status] = parseInt(r.count, 10) || 0;
  });

  // Stage definitions — each stage aggregates several item statuses
  const stages = [
    {
      stage: "Dyeing",
      statuses: ["READY_FOR_DYEING", "PARTIALLY_IN_DYEING", "IN_DYEING", "DYEING_COMPLETED"],
    },
    {
      stage: "Production",
      statuses: [
        "READY_FOR_PRODUCTION",
        "IN_PRODUCTION",
        "PARTIAL_IN_PRODUCTION",
        "PRODUCTION_COMPLETED",
      ],
    },
    {
      stage: "QA",
      statuses: ["ALL_SECTIONS_QA_APPROVED", "VIDEO_UPLOADED", "READY_FOR_CLIENT_APPROVAL"],
    },
    {
      stage: "Awaiting Client",
      statuses: ["AWAITING_CLIENT_APPROVAL", "ALTERATION_REQUIRED"],
    },
    {
      stage: "Approved",
      statuses: ["CLIENT_APPROVED", "READY_FOR_DISPATCH"],
    },
  ];

  const pipeline = stages.map((s) => {
    const breakdown = s.statuses
      .map((st) => ({ status: st, count: countMap[st] || 0 }))
      .filter((b) => b.count > 0);
    const count = breakdown.reduce((sum, b) => sum + b.count, 0);
    return { stage: s.stage, count, breakdown };
  });

  return { pipeline };
}

// =========================================================================
// C. INVENTORY ALERTS
// =========================================================================

/**
 * Low stock, out of stock, open procurement demands, and total shortage value.
 */
async function getInventoryAlerts() {
  // Low stock — uses model helper which handles variants
  const lowStockItems = await InventoryItem.findLowStock(true);
  const lowStockCount = lowStockItems.length;

  // Out of stock — simple items with remaining_stock = 0
  const outOfStockSimple = await InventoryItem.count({
    where: {
      has_variants: false,
      is_active: true,
      remaining_stock: 0,
    },
  });

  // Out of stock — variant items where ALL variants are at 0
  let outOfStockVariant = 0;
  if (InventoryItemVariant) {
    const variantParents = await InventoryItem.findAll({
      where: { has_variants: true, is_active: true },
      include: [
        {
          model: InventoryItemVariant,
          as: "variants",
          where: { is_active: true },
          required: true,
        },
      ],
    });
    outOfStockVariant = variantParents.filter((p) =>
      p.variants.every((v) => parseFloat(v.remaining_stock || 0) === 0)
    ).length;
  }
  const outOfStockCount = outOfStockSimple + outOfStockVariant;

  // Open procurement demands
  const openProcurementCount = await ProcurementDemand.count({
    where: { status: "OPEN" },
  });

  // Total shortage value = SUM(shortage_qty * inventory_item.unit_price) for OPEN
  const openDemands = await ProcurementDemand.findAll({
    where: { status: "OPEN" },
    include: [
      {
        model: InventoryItem,
        as: "inventoryItem",
        attributes: ["id", "unit_price"],
      },
    ],
  });

  const totalShortageValue = openDemands.reduce((sum, d) => {
    const price = d.inventoryItem ? parseFloat(d.inventoryItem.unit_price || 0) : 0;
    const shortage = parseFloat(d.shortage_qty || 0);
    return sum + price * shortage;
  }, 0);

  return {
    lowStockCount,
    outOfStockCount,
    openProcurementCount,
    totalShortageValue: Math.round(totalShortageValue * 100) / 100,
  };
}

// =========================================================================
// D. QA METRICS
// =========================================================================

/**
 * QA approval and rejection rates over the current calendar month.
 * Counts OrderItemSection rows whose status_updated_at falls in this month.
 */
async function getQAMetrics() {
  const monthStart = startOfThisMonth();

  // All-time totals
  const totalApproved = await OrderItemSection.count({
    where: { status: "QA_APPROVED" },
  });
  const totalRejected = await OrderItemSection.count({
    where: { status: "QA_REJECTED" },
  });

  // This month — using status_updated_at as the QA decision timestamp
  const approvedThisMonth = await OrderItemSection.count({
    where: {
      status: "QA_APPROVED",
      status_updated_at: { [Op.gte]: monthStart },
    },
  });
  const rejectedThisMonth = await OrderItemSection.count({
    where: {
      status: "QA_REJECTED",
      status_updated_at: { [Op.gte]: monthStart },
    },
  });

  const monthTotal = approvedThisMonth + rejectedThisMonth;
  const approvalRate = monthTotal > 0 ? (approvedThisMonth / monthTotal) * 100 : 0;
  const rejectionRate = monthTotal > 0 ? (rejectedThisMonth / monthTotal) * 100 : 0;

  return {
    totalApproved,
    totalRejected,
    approvedThisMonth,
    rejectedThisMonth,
    approvalRate: Math.round(approvalRate * 10) / 10,
    rejectionRate: Math.round(rejectionRate * 10) / 10,
    avgRoundsPerSection: null, // Not tracked — future enhancement
  };
}

// =========================================================================
// E. SALES SUMMARY
// =========================================================================

/**
 * Per-salesperson revenue & order counts for this month vs last month.
 * Excludes cancelled orders.
 */
async function getSalesSummary() {
  const thisMonthStart = startOfThisMonth();
  const lastMonthStart = startOfLastMonth();
  const lastMonthEnd = endOfLastMonth();

  // This month aggregation
  const thisMonthRows = await Order.findAll({
    attributes: [
      "sales_owner_id",
      [fn("COUNT", col("Order.id")), "orders"],
      [fn("COALESCE", fn("SUM", col("total_amount")), 0), "revenue"],
      [fn("COALESCE", fn("AVG", col("total_amount")), 0), "avgValue"],
    ],
    include: [
      {
        model: User,
        as: "salesOwner",
        attributes: ["id", "name"],
      },
    ],
    where: {
      sales_owner_id: { [Op.ne]: null },
      created_at: { [Op.gte]: thisMonthStart },
      status: { [Op.ne]: ORDER_STATUS.CANCELLED },
    },
    group: ["sales_owner_id", "salesOwner.id"],
    raw: true,
    nest: true,
  });

  // Last month aggregation (for comparison)
  const lastMonthRows = await Order.findAll({
    attributes: [
      "sales_owner_id",
      [fn("COUNT", col("Order.id")), "orders"],
      [fn("COALESCE", fn("SUM", col("total_amount")), 0), "revenue"],
    ],
    where: {
      sales_owner_id: { [Op.ne]: null },
      created_at: { [Op.gte]: lastMonthStart, [Op.lt]: lastMonthEnd },
      status: { [Op.ne]: ORDER_STATUS.CANCELLED },
    },
    group: ["sales_owner_id"],
    raw: true,
  });

  // Index last month by salesperson
  const lastMonthMap = {};
  lastMonthRows.forEach((r) => {
    lastMonthMap[r.sales_owner_id] = {
      orders: parseInt(r.orders, 10) || 0,
      revenue: parseFloat(r.revenue) || 0,
    };
  });

  const summary = thisMonthRows.map((r) => {
    const ordersThisMonth = parseInt(r.orders, 10) || 0;
    const revenueThisMonth = parseFloat(r.revenue) || 0;
    const avgOrderValue = parseFloat(r.avgValue) || 0;

    const last = lastMonthMap[r.sales_owner_id] || { orders: 0, revenue: 0 };
    const revenueChangePct =
      last.revenue > 0
        ? ((revenueThisMonth - last.revenue) / last.revenue) * 100
        : revenueThisMonth > 0
        ? 100
        : 0;

    return {
      salespersonId: r.sales_owner_id,
      salespersonName: r.salesOwner ? r.salesOwner.name : "Unknown",
      ordersThisMonth,
      revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
      avgOrderValue: Math.round(avgOrderValue * 100) / 100,
      ordersLastMonth: last.orders,
      revenueLastMonth: Math.round(last.revenue * 100) / 100,
      revenueChangePct: Math.round(revenueChangePct * 10) / 10,
    };
  });

  // Sort by this-month revenue descending
  summary.sort((a, b) => b.revenueThisMonth - a.revenueThisMonth);

  // Totals row
  const totals = summary.reduce(
    (acc, s) => {
      acc.ordersThisMonth += s.ordersThisMonth;
      acc.revenueThisMonth += s.revenueThisMonth;
      acc.ordersLastMonth += s.ordersLastMonth;
      acc.revenueLastMonth += s.revenueLastMonth;
      return acc;
    },
    { ordersThisMonth: 0, revenueThisMonth: 0, ordersLastMonth: 0, revenueLastMonth: 0 }
  );
  totals.revenueThisMonth = Math.round(totals.revenueThisMonth * 100) / 100;
  totals.revenueLastMonth = Math.round(totals.revenueLastMonth * 100) / 100;

  return { salespeople: summary, totals };
}

// =========================================================================
// F. RECENT ACTIVITY
// =========================================================================

/**
 * Last 20 activities across all orders, joined with order & user context.
 */
async function getRecentActivity(limit = 20) {
  const activities = await OrderActivity.findAll({
    include: [
      {
        model: Order,
        as: "order",
        attributes: ["id", "order_number", "customer_name"],
      },
      {
        model: User,
        as: "performer",
        attributes: ["id", "name"],
      },
    ],
    order: [["created_at", "DESC"]],
    limit,
  });

  return activities.map((a) => {
    const j = a.toJSON();
    return {
      id: j.id,
      action: j.action,
      actionType: j.action_type,
      sectionName: j.section_name,
      userName: j.user_name || (j.performer ? j.performer.name : null),
      userId: j.user_id,
      orderId: j.order_id,
      orderNumber: j.order ? j.order.order_number : null,
      customerName: j.order ? j.order.customer_name : null,
      details: j.details,
      createdAt: j.created_at || j.createdAt,
    };
  });
}

// =========================================================================
// Exports
// =========================================================================

module.exports = {
  getOrderFunnel,
  getProductionPipeline,
  getInventoryAlerts,
  getQAMetrics,
  getSalesSummary,
  getRecentActivity,
};