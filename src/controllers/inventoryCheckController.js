/**
 * Inventory Check Controller
 *
 * HTTP handlers for inventory check endpoints on order items.
 * Registered in orderItemRoutes.js.
 */

const inventoryCheckService = require("../services/inventoryCheckService");
const { serializeOrderItem } = require("../utils/orderItemSerializer");

// ─── POST /api/order-items/:id/inventory-check ───────────────────────

async function runInventoryCheck(req, res, next) {
  try {
    const result = await inventoryCheckService.runInventoryCheck(
      req.params.id,
      req.body,
      req.user
    );

    // Serialize the item for frontend (camelCase)
    const serializedItem = result.item
      ? serializeOrderItem(
          result.item.toJSON ? result.item.toJSON() : result.item
        )
      : null;

    res.json({
      success: true,
      data: {
        item: serializedItem,
        sectionResults: result.sectionResults,
        passedSections: result.passedSections,
        failedSections: result.failedSections,
        materialRequirements: result.materialRequirements,
        shortages: result.shortages,
        stockDeductions: result.stockDeductions,
        nextStatus: result.nextStatus,
        procurementDemandsCreated: result.procurementDemandsCreated,
        packet: result.packet || null,
        packetCreated: result.packetCreated || false,
      },
      message: `Inventory check complete. Status: ${result.nextStatus}`,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        error: err.code || "INVENTORY_CHECK_ERROR",
        message: err.message,
      });
    }
    next(err);
  }
}

// ─── POST /api/order-items/:id/rerun-section-inventory-check ─────────

async function rerunSectionInventoryCheck(req, res, next) {
  try {
    const result = await inventoryCheckService.rerunSectionCheck(
      req.params.id,
      req.body,
      req.user
    );

    const serializedItem = result.item
      ? serializeOrderItem(
          result.item.toJSON ? result.item.toJSON() : result.item
        )
      : null;

    res.json({
      success: true,
      data: {
        item: serializedItem,
        sectionResults: result.sectionResults,
        passedSections: result.passedSections,
        failedSections: result.failedSections,
        materialRequirements: result.materialRequirements,
        stockDeductions: result.stockDeductions,
        nextStatus: result.nextStatus,
      },
      message:
        result.passedSections.length > 0
          ? `Re-run passed for: ${result.passedSections.join(", ")}`
          : "No sections passed inventory check yet",
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({
        error: err.code || "RERUN_CHECK_ERROR",
        message: err.message,
      });
    }
    next(err);
  }
}

module.exports = {
  runInventoryCheck,
  rerunSectionInventoryCheck,
};