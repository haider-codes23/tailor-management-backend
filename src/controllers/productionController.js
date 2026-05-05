/**
 * Production Controller — Phase 12
 * Thin HTTP handlers delegating to productionService.
 */

const productionService = require("../services/productionService");

// ── Round Robin & Assignment ────────────────────────────────────────

exports.getRoundRobinState = async (req, res, next) => {
  try {
    const data = await productionService.getRoundRobinState();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.getReadyForAssignment = async (req, res, next) => {
  try {
    const data = await productionService.getReadyForAssignment();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.assignProductionHead = async (req, res, next) => {
  try {
    const { orderItemId } = req.params;
    const { assignedBy, productionHeadId } = req.body;
    const userId = assignedBy || req.user?.id;

    if (!productionHeadId) {
      return res.status(400).json({ success: false, error: "productionHeadId is required" });
    }

    const data = await productionService.assignProductionHead(orderItemId, {
      assignedBy: userId,
      productionHeadId,
    });

    res.json({ success: true, data: data.assignment ? data : data, message: data.message });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
};

exports.getProductionHeadsList = async (req, res, next) => {
  try {
    const data = await productionService.getProductionHeadsList();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.getProductionHeadsWorkload = async (req, res, next) => {
  try {
    const data = await productionService.getProductionHeadsWorkload();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ── Production Head Dashboard ───────────────────────────────────────

exports.getMyAssignments = async (req, res, next) => {
  try {
    const queryUserId = req.query.userId;
    const userId = (queryUserId && queryUserId !== "undefined") ? queryUserId : req.user?.id;
    const userRole = req.user?.role || "ADMIN";
    const data = await productionService.getMyAssignments(userId, userRole);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.getOrderItemDetails = async (req, res, next) => {
  try {
    const { orderItemId } = req.params;
    const data = await productionService.getOrderItemDetails(orderItemId);
    res.json({ success: true, data });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
};

exports.getWorkers = async (req, res, next) => {
  try {
    const data = await productionService.getWorkers();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ── Task Management ─────────────────────────────────────────────────

exports.createSectionTasks = async (req, res, next) => {
  try {
    const { orderItemId, sectionName } = req.params;
    const { tasks, notes } = req.body;
    const userId = req.body.createdBy || req.user?.id;

    if (!tasks || !Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({ success: false, error: "Tasks array is required" });
    }

    const data = await productionService.createSectionTasks(orderItemId, sectionName, {
      tasks,
      notes,
      userId,
    });

    res.json({ success: true, data, message: data.message });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
};

exports.getSectionTasks = async (req, res, next) => {
  try {
    const { orderItemId, sectionName } = req.params;
    const data = await productionService.getSectionTasks(orderItemId, sectionName);
    res.json({ success: true, data });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
};

exports.startSectionProduction = async (req, res, next) => {
  try {
    const { orderItemId, sectionName } = req.params;
    const userId = req.body.startedBy || req.user?.id;
    const data = await productionService.startSectionProduction(orderItemId, sectionName, {
      userId,
    });
    res.json({ success: true, ...data });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
};

// ── Worker Tasks ────────────────────────────────────────────────────

exports.getWorkerTasks = async (req, res, next) => {
  try {
    const queryUserId = req.query.userId;
    const userId = (queryUserId && queryUserId !== "undefined" && queryUserId !== "null")
      ? queryUserId
      : req.user?.id;
    const userRole = req.user?.role || "WORKER";

    if (!userId) {
      return res.json({ success: true, data: [] });
    }

    const data = await productionService.getWorkerTasks(userId, userRole);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.startTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const data = await productionService.startTask(taskId);
    res.json({ success: true, data, message: "Task started successfully" });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
};

exports.completeTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const result = await productionService.completeTask(taskId);
    const { message, ...data } = result;
    res.json({ success: true, data, message });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
};

exports.reassignTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { newWorkerId, reason } = req.body;
    const userId = req.user?.id;

    const data = await productionService.reassignTask(taskId, {
      newWorkerId,
      reason,
      userId,
    });

    res.json({ success: true, data, message: "Task reassigned successfully" });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
};

// ── Section Timeline & QA ───────────────────────────────────────────

exports.getSectionTimeline = async (req, res, next) => {
  try {
    const { orderItemId, sectionName } = req.params;
    const data = await productionService.getSectionTimeline(orderItemId, sectionName);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.sendSectionToQA = async (req, res, next) => {
  try {
    const { orderItemId, sectionName } = req.params;
    const userId = req.body.sentBy || req.user?.id;
    const data = await productionService.sendSectionToQA(orderItemId, sectionName, { userId });
    res.json({ success: true, ...data });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    next(err);
  }
};