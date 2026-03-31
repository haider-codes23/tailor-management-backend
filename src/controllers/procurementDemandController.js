/**
 * Procurement Demand Controller
 *
 * HTTP handlers for procurement demand CRUD.
 * Mirrors the MSW procurementHandlers.js logic.
 */

const procurementService = require("../services/procurementDemandService");

// ─── GET /api/procurement-demands ─────────────────────────────────────

async function listDemands(req, res, next) {
  try {
    const demands = await procurementService.listDemands(req.query);
    res.json({
      success: true,
      data: demands,
      total: demands.length,
    });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/procurement-demands/stats ───────────────────────────────

async function getStats(req, res, next) {
  try {
    const stats = await procurementService.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/procurement-demands/:id ─────────────────────────────────

async function getDemandById(req, res, next) {
  try {
    const demand = await procurementService.getDemandById(req.params.id);
    res.json({ success: true, data: demand });
  } catch (err) {
    next(err);
  }
}

// ─── PATCH /api/procurement-demands/:id ───────────────────────────────

async function updateDemand(req, res, next) {
  try {
    const demand = await procurementService.updateDemand(
      req.params.id,
      req.body
    );
    res.json({ success: true, data: demand });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/procurement-demands/:id ──────────────────────────────

async function deleteDemand(req, res, next) {
  try {
    await procurementService.deleteDemand(req.params.id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listDemands,
  getStats,
  getDemandById,
  updateDemand,
  deleteDemand,
};