/**
 * Procurement Demand Service
 *
 * CRUD operations for procurement demands.
 * Mirrors the MSW procurementHandlers.js logic.
 *
 * Endpoints:
 *   GET    /procurement-demands         — List with filters
 *   GET    /procurement-demands/stats   — Dashboard counts
 *   GET    /procurement-demands/:id     — Single demand
 *   PATCH  /procurement-demands/:id     — Update status/notes
 *   DELETE /procurement-demands/:id     — Delete demand
 */

const { Op } = require("sequelize");
const { ProcurementDemand, Order, OrderItem, InventoryItem } = require("../models");

// =========================================================================
// Helpers
// =========================================================================

function serviceError(msg, status = 400, code = "PROCUREMENT_ERROR") {
  const err = new Error(msg);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Serialize a procurement demand to camelCase for the frontend.
 */
function serializeDemand(demand) {
  const d = demand.toJSON ? demand.toJSON() : { ...demand };
  return {
    id: d.id,
    orderId: d.order_id,
    orderItemId: d.order_item_id,
    inventoryItemId: d.inventory_item_id,
    inventoryItemName: d.inventory_item_name,
    inventoryItemSku: d.inventory_item_sku,
    requiredQty: parseFloat(d.required_qty) || 0,
    availableQty: parseFloat(d.available_qty) || 0,
    shortageQty: parseFloat(d.shortage_qty) || 0,
    unit: d.unit,
    affectedSection: d.affected_section,
    status: d.status,
    notes: d.notes,
    createdAt: d.created_at || d.createdAt,
    updatedAt: d.updated_at || d.updatedAt,
    // Include joined data if present
    order: d.order
      ? { id: d.order.id, orderNumber: d.order.order_number }
      : undefined,
    orderItem: d.orderItem
      ? { id: d.orderItem.id, productName: d.orderItem.product_name }
      : undefined,
  };
}

// =========================================================================
// A. LIST PROCUREMENT DEMANDS
// =========================================================================

async function listDemands(params = {}) {
  const where = {};

  if (params.status) where.status = params.status;
  if (params.orderId) where.order_id = params.orderId;
  if (params.orderItemId) where.order_item_id = params.orderItemId;

  const demands = await ProcurementDemand.findAll({
    where,
    include: [
      { model: Order, as: "order", attributes: ["id", "order_number"] },
      { model: OrderItem, as: "orderItem", attributes: ["id", "product_name"] },
    ],
    order: [["created_at", "DESC"]],
  });

  return demands.map(serializeDemand);
}

// =========================================================================
// B. GET STATS
// =========================================================================

async function getStats() {
  const total = await ProcurementDemand.count();
  const open = await ProcurementDemand.count({ where: { status: "OPEN" } });
  const ordered = await ProcurementDemand.count({ where: { status: "ORDERED" } });
  const received = await ProcurementDemand.count({ where: { status: "RECEIVED" } });
  const cancelled = await ProcurementDemand.count({ where: { status: "CANCELLED" } });

  return { total, open, ordered, received, cancelled };
}

// =========================================================================
// C. GET BY ID
// =========================================================================

async function getDemandById(id) {
  const demand = await ProcurementDemand.findByPk(id, {
    include: [
      { model: Order, as: "order", attributes: ["id", "order_number"] },
      { model: OrderItem, as: "orderItem", attributes: ["id", "product_name"] },
      { model: InventoryItem, as: "inventoryItem", attributes: ["id", "name", "sku", "remaining_stock", "unit"] },
    ],
  });

  if (!demand) {
    throw serviceError("Procurement demand not found", 404, "DEMAND_NOT_FOUND");
  }

  return serializeDemand(demand);
}

// =========================================================================
// D. UPDATE DEMAND
// =========================================================================

async function updateDemand(id, data) {
  const demand = await ProcurementDemand.findByPk(id);

  if (!demand) {
    throw serviceError("Procurement demand not found", 404, "DEMAND_NOT_FOUND");
  }

  const updateFields = {};
  if (data.status !== undefined) updateFields.status = data.status;
  if (data.notes !== undefined) updateFields.notes = data.notes;

  await demand.update(updateFields);

  return serializeDemand(demand);
}

// =========================================================================
// E. DELETE DEMAND
// =========================================================================

async function deleteDemand(id) {
  const demand = await ProcurementDemand.findByPk(id);

  if (!demand) {
    throw serviceError("Procurement demand not found", 404, "DEMAND_NOT_FOUND");
  }

  await demand.destroy();
  return { deleted: true };
}

// =========================================================================
// Exports
// =========================================================================

module.exports = {
  listDemands,
  getStats,
  getDemandById,
  updateDemand,
  deleteDemand,
  serializeDemand,
};