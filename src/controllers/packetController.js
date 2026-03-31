/**
 * Packet Controller — Phase 10
 *
 * Thin HTTP layer — delegates to packetService.
 */

const packetService = require("../services/packetService");

// ─── GET /api/order-items/:id/packet ──────────────────────────────────
async function getPacket(req, res, next) {
  try {
    const data = await packetService.getPacket(req.params.id);
    return res.json({ success: true, data });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    next(err);
  }
}

// ─── GET /api/packets ─────────────────────────────────────────────────
async function listPackets(req, res, next) {
  try {
    const { status, assignedTo } = req.query;
    const data = await packetService.listPackets({ status, assignedTo });
    return res.json({ success: true, data, meta: { total: data.length } });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/packets/my-tasks ────────────────────────────────────────
async function getMyTasks(req, res, next) {
  try {
    const { userId, status, startDate, endDate } = req.query;
    const uid = userId || req.user?.id;
    const data = await packetService.getMyTasks(uid, status, { startDate, endDate });
    return res.json({ success: true, data, meta: { total: data.length } });
  } catch (err) {
    next(err);
  }
}

// ─── GET /api/packets/check-queue ─────────────────────────────────────
async function getCheckQueue(req, res, next) {
  try {
    const data = await packetService.getCheckQueue();
    return res.json({ success: true, data, meta: { total: data.length } });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/order-items/:id/packet/assign ──────────────────────────
async function assignPacket(req, res, next) {
  try {
    const result = await packetService.assignPacket(req.params.id, req.body);
    return res.json({ success: true, data: result.packet, message: result.message });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    next(err);
  }
}

// ─── POST /api/order-items/:id/packet/start ───────────────────────────
async function startPacket(req, res, next) {
  try {
    const result = await packetService.startPacket(req.params.id, req.body);
    return res.json({ success: true, data: result.packet, message: result.message });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    next(err);
  }
}

// ─── POST /api/order-items/:id/packet/pick-item ───────────────────────
async function pickItem(req, res, next) {
  try {
    const result = await packetService.pickItem(req.params.id, req.body);
    return res.json({ success: true, data: result.packet, message: result.message });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    next(err);
  }
}

// ─── POST /api/order-items/:id/packet/complete ────────────────────────
async function completePacket(req, res, next) {
  try {
    const result = await packetService.completePacket(req.params.id, req.body);
    return res.json({ success: true, data: result.packet, message: result.message });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    next(err);
  }
}

// ─── POST /api/order-items/:id/packet/approve ─────────────────────────
async function approvePacket(req, res, next) {
  try {
    const result = await packetService.approvePacket(req.params.id, req.body);
    return res.json({
      success: true,
      data: { packet: result.packet, nextStatus: result.nextStatus },
      message: result.message,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    next(err);
  }
}

// ─── POST /api/order-items/:id/packet/reject ──────────────────────────
async function rejectPacket(req, res, next) {
  try {
    const result = await packetService.rejectPacket(req.params.id, req.body);
    return res.json({ success: true, data: result.packet, message: result.message });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    next(err);
  }
}

module.exports = {
  getPacket,
  listPackets,
  getMyTasks,
  getCheckQueue,
  assignPacket,
  startPacket,
  pickItem,
  completePacket,
  approvePacket,
  rejectPacket,
};