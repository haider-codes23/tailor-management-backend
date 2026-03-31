/**
 * Dyeing Controller — Phase 11
 * Thin HTTP handlers delegating to dyeingService.
 */

const dyeingService = require("../services/dyeingService");

// ── Queries ───────────────────────────────────────────────────────────

exports.getAvailableTasks = async (req, res, next) => {
  try {
    const { sortBy, sortOrder, priority } = req.query;
    const data = await dyeingService.getAvailableTasks({ sortBy, sortOrder, priority });
    res.json({ success: true, data });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.code, message: err.message });
    next(err);
  }
};

exports.getMyTasks = async (req, res, next) => {
  try {
    const { userId, sortBy, sortOrder } = req.query;
    if (!userId) {
      return res.status(400).json({ error: "MISSING_USER_ID", message: "userId query param is required" });
    }
    const data = await dyeingService.getMyTasks(userId, { sortBy, sortOrder });
    res.json({ success: true, data });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.code, message: err.message });
    next(err);
  }
};

exports.getCompletedTasks = async (req, res, next) => {
  try {
    const { userId, page, limit, startDate, endDate } = req.query;
    const result = await dyeingService.getCompletedTasks({
      userId,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 20,
      startDate,
      endDate,
    });
    res.json({ success: true, data: result.tasks, meta: result.meta });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.code, message: err.message });
    next(err);
  }
};

exports.getTaskDetails = async (req, res, next) => {
  try {
    const data = await dyeingService.getTaskDetails(req.params.orderItemId);
    res.json({ success: true, data });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.code, message: err.message });
    next(err);
  }
};

exports.getStats = async (req, res, next) => {
  try {
    const { userId } = req.query;
    const data = await dyeingService.getStats(userId || null);
    res.json({ success: true, data });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.code, message: err.message });
    next(err);
  }
};

// ── Mutations ─────────────────────────────────────────────────────────

exports.acceptSections = async (req, res, next) => {
  try {
    const { userId, sections } = req.body;
    if (!userId || !sections || sections.length === 0) {
      return res.status(400).json({ error: "VALIDATION", message: "userId and sections are required" });
    }
    const data = await dyeingService.acceptSections(req.params.orderItemId, { userId, sections });
    res.json({ success: true, data, message: `Accepted ${sections.length} section(s) for dyeing` });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.code, message: err.message });
    next(err);
  }
};

exports.startDyeing = async (req, res, next) => {
  try {
    const { userId, sections } = req.body;
    if (!userId || !sections || sections.length === 0) {
      return res.status(400).json({ error: "VALIDATION", message: "userId and sections are required" });
    }
    const data = await dyeingService.startDyeing(req.params.orderItemId, { userId, sections });
    res.json({ success: true, data, message: `Started dyeing for ${sections.length} section(s)` });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.code, message: err.message });
    next(err);
  }
};

exports.completeDyeing = async (req, res, next) => {
  try {
    const { userId, sections } = req.body;
    if (!userId || !sections || sections.length === 0) {
      return res.status(400).json({ error: "VALIDATION", message: "userId and sections are required" });
    }
    const result = await dyeingService.completeDyeing(req.params.orderItemId, { userId, sections });
    const msg = result.allSectionsReady
      ? `Dyeing completed. All sections ready for production!`
      : `Dyeing completed for ${sections.length} section(s)`;
    res.json({ success: true, data: result, message: msg });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.code, message: err.message });
    next(err);
  }
};

exports.rejectSections = async (req, res, next) => {
  try {
    const { userId, sections, reasonCode, notes } = req.body;
    if (!userId || !sections || sections.length === 0 || !notes) {
      return res.status(400).json({
        error: "VALIDATION",
        message: "userId, sections, and notes are required",
      });
    }
    const data = await dyeingService.rejectSections(req.params.orderItemId, {
      userId,
      sections,
      reasonCode,
      notes,
    });
    res.json({
      success: true,
      data,
      message: `Rejected ${sections.length} section(s). Inventory released and sections sent back for re-processing.`,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.code, message: err.message });
    next(err);
  }
};