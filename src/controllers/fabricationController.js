/**
 * Fabrication Controller
 *
 * HTTP handlers for the Fabrication (Bespoke) module.
 * All logic is delegated to fabricationService.
 */

const fabricationService = require("../services/fabricationService");

// ─── GET /api/fabrication/orders ─────────────────────────────────────

async function getFabricationOrders(req, res, next) {
    try {
        const data = await fabricationService.getFabricationOrders();
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

// ─── GET /api/fabrication/orders/:orderId ────────────────────────────

async function getFabricationOrder(req, res, next) {
    try {
        const data = await fabricationService.getFabricationOrder(req.params.orderId);
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

// ─── GET /api/fabrication/orders/:orderId/items/:itemId ─────────────

async function getFabricationItem(req, res, next) {
    try {
        const data = await fabricationService.getFabricationItem(
            req.params.orderId,
            req.params.itemId
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

// ─── POST /api/fabrication/items/:itemId/custom-bom ─────────────────

async function createCustomBOM(req, res, next) {
    try {
        const data = await fabricationService.createCustomBOM(
            req.params.itemId,
            req.body,
            req.user
        );
        res.status(201).json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

// ─── PUT /api/fabrication/items/:itemId/custom-bom ──────────────────

async function updateCustomBOM(req, res, next) {
    try {
        const data = await fabricationService.updateCustomBOM(
            req.params.itemId,
            req.body,
            req.user
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

// ─── POST .../pieces/:piece/items ───────────────────────────────────

async function addBOMItem(req, res, next) {
    try {
        const data = await fabricationService.addBOMItem(
            req.params.itemId,
            req.params.piece,
            req.body,
            req.user
        );
        res.status(201).json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

// ─── PUT .../pieces/:piece/items/:bomItemId ─────────────────────────

async function updateBOMItem(req, res, next) {
    try {
        const data = await fabricationService.updateBOMItem(
            req.params.itemId,
            req.params.piece,
            req.params.bomItemId,
            req.body,
            req.user
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

// ─── DELETE .../pieces/:piece/items/:bomItemId ──────────────────────

async function deleteBOMItem(req, res, next) {
    try {
        const data = await fabricationService.deleteBOMItem(
            req.params.itemId,
            req.params.piece,
            req.params.bomItemId
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

// ─── POST .../custom-bom/submit ─────────────────────────────────────

async function submitCustomBOM(req, res, next) {
    try {
        const data = await fabricationService.submitCustomBOM(
            req.params.itemId,
            req.body,
            req.user
        );
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getFabricationOrders,
    getFabricationOrder,
    getFabricationItem,
    createCustomBOM,
    updateCustomBOM,
    addBOMItem,
    updateBOMItem,
    deleteBOMItem,
    submitCustomBOM,
};
