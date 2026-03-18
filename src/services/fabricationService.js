/**
 * Fabrication Service
 *
 * Business logic for the Fabrication (Bespoke) module.
 * Handles custom BOM creation/editing for CUSTOM-size order items
 * that enter the FABRICATION_BESPOKE status after customer form approval.
 *
 * Endpoints served:
 *   GET    /api/fabrication/orders
 *   GET    /api/fabrication/orders/:orderId
 *   GET    /api/fabrication/orders/:orderId/items/:itemId
 *   POST   /api/fabrication/items/:itemId/custom-bom
 *   PUT    /api/fabrication/items/:itemId/custom-bom
 *   POST   /api/fabrication/items/:itemId/custom-bom/pieces/:piece/items
 *   PUT    /api/fabrication/items/:itemId/custom-bom/pieces/:piece/items/:bomItemId
 *   DELETE /api/fabrication/items/:itemId/custom-bom/pieces/:piece/items/:bomItemId
 *   POST   /api/fabrication/items/:itemId/custom-bom/submit
 */

const { Op } = require("sequelize");
const {
    Order,
    OrderItem,
    OrderItemSection,
    OrderActivity,
    User,
    sequelize,
} = require("../models");

const {
    ORDER_ITEM_STATUS,
    SIZE_TYPE,
    ACTIVITY_ACTION_TYPE,
} = require("../constants/order");

const { serializeOrder, serializeOrderItem } = require("../utils/orderSerializer");

// =========================================================================
// Helpers
// =========================================================================

function serviceError(msg, status = 400, code = "FABRICATION_ERROR") {
    const err = new Error(msg);
    err.status = status;
    err.code = code;
    return err;
}

function generateBomItemId() {
    return `cbom-item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// =========================================================================
// GET /api/fabrication/orders
// List all orders with ≥1 item in FABRICATION_BESPOKE status
// =========================================================================

async function getFabricationOrders() {
    // Find all order IDs that have at least one FABRICATION_BESPOKE + CUSTOM item
    const orders = await Order.findAll({
        include: [
            {
                model: OrderItem,
                as: "items",
                where: {
                    status: ORDER_ITEM_STATUS.FABRICATION_BESPOKE,
                    size_type: SIZE_TYPE.CUSTOM,
                },
                attributes: ["id"],
                required: true, // INNER JOIN — only orders with matching items
            },
            {
                model: User,
                as: "salesOwner",
                attributes: ["id", "name"],
                required: false,
            },
        ],
        order: [["created_at", "DESC"]],
    });

    // Serialize to match frontend expectations
    const result = orders.map((order) => {
        const json = order.toJSON ? order.toJSON() : order;
        return {
            id: json.id,
            orderNumber: json.order_number,
            customerName: json.customer_name,
            consultantName: json.consultant_name || (json.salesOwner ? json.salesOwner.name : null),
            productionShippingDate: json.production_shipping_date,
            customItemsCount: json.items ? json.items.length : 0,
            createdAt: json.created_at || json.createdAt,
            updatedAt: json.updated_at || json.updatedAt,
        };
    });

    return result;
}

// =========================================================================
// GET /api/fabrication/orders/:orderId
// Get order with only its CUSTOM-size items
// =========================================================================

async function getFabricationOrder(orderId) {
    const order = await Order.findByPk(orderId, {
        include: [
            {
                model: OrderItem,
                as: "items",
                where: { size_type: SIZE_TYPE.CUSTOM },
                required: false,
                include: [
                    { model: OrderItemSection, as: "sections", order: [["created_at", "ASC"]] },
                ],
            },
            { model: User, as: "salesOwner", attributes: ["id", "name", "email"] },
            { model: User, as: "productionHead", attributes: ["id", "name", "email"] },
        ],
    });

    if (!order) {
        throw serviceError("Order not found", 404, "ORDER_NOT_FOUND");
    }

    const json = order.toJSON ? order.toJSON() : order;

    return {
        id: json.id,
        orderNumber: json.order_number,
        customerName: json.customer_name,
        customerEmail: json.customer_email,
        customerPhone: json.customer_phone,
        consultantName: json.consultant_name || (json.salesOwner ? json.salesOwner.name : null),
        productionInCharge: json.production_in_charge || (json.productionHead ? json.productionHead.name : null),
        productionShippingDate: json.production_shipping_date,
        clientHeight: json.client_height,
        createdAt: json.created_at || json.createdAt,
        items: (json.items || []).map((item) => ({
            id: item.id,
            productId: item.product_id,
            productName: item.product_name,
            productImage: item.product_image,
            productSku: item.product_sku,
            size: item.size,
            quantity: item.quantity,
            status: item.status,
            customBOM: item.custom_bom || null,
            hasBOM: !!item.custom_bom,
            includedItems: item.included_items || [],
            selectedAddOns: item.selected_add_ons || [],
        })),
    };
}

// =========================================================================
// GET /api/fabrication/orders/:orderId/items/:itemId
// Full item detail for fabrication (includes parent order context)
// =========================================================================

async function getFabricationItem(orderId, itemId) {
    const order = await Order.findByPk(orderId, {
        attributes: [
            "id", "order_number", "customer_name", "customer_email",
            "customer_phone", "consultant_name", "production_in_charge",
            "production_shipping_date", "client_height", "created_at", "notes",
        ],
    });

    if (!order) {
        throw serviceError("Order not found", 404, "ORDER_NOT_FOUND");
    }

    const item = await OrderItem.findOne({
        where: { id: itemId, order_id: orderId },
        include: [
            { model: OrderItemSection, as: "sections", order: [["created_at", "ASC"]] },
        ],
    });

    if (!item) {
        throw serviceError("Order item not found", 404, "ORDER_ITEM_NOT_FOUND");
    }

    // Get timeline
    const activities = await OrderActivity.findAll({
        where: { order_item_id: itemId },
        include: [
            { model: User, as: "performer", attributes: ["id", "name"], required: false },
        ],
        order: [["created_at", "ASC"]],
    });

    const timeline = activities.map((a) => {
        const aj = a.toJSON ? a.toJSON() : a;
        return {
            id: aj.id,
            action: aj.action,
            user: aj.performer ? aj.performer.name : (aj.user_name || "System"),
            timestamp: aj.created_at || aj.createdAt,
        };
    });

    const orderJson = order.toJSON ? order.toJSON() : order;
    const itemJson = item.toJSON ? item.toJSON() : item;

    return {
        order: {
            id: orderJson.id,
            orderNumber: orderJson.order_number,
            customerName: orderJson.customer_name,
            customerEmail: orderJson.customer_email,
            customerPhone: orderJson.customer_phone,
            consultantName: orderJson.consultant_name,
            productionInCharge: orderJson.production_in_charge,
            productionShippingDate: orderJson.production_shipping_date,
            clientHeight: orderJson.client_height,
            createdAt: orderJson.created_at || orderJson.createdAt,
            notes: orderJson.notes,
        },
        item: {
            id: itemJson.id,
            orderId: itemJson.order_id,
            productId: itemJson.product_id,
            productName: itemJson.product_name,
            productImage: itemJson.product_image,
            productSku: itemJson.product_sku,
            sizeType: itemJson.size_type,
            size: itemJson.size,
            quantity: itemJson.quantity,
            status: itemJson.status,
            style: itemJson.style,
            color: itemJson.color,
            fabric: itemJson.fabric,
            measurementCategories: itemJson.measurement_categories || [],
            measurements: itemJson.measurements || {},
            includedItems: itemJson.included_items || [],
            selectedAddOns: itemJson.selected_add_ons || [],
            orderForm: itemJson.order_form || null,
            orderFormGenerated: itemJson.order_form_generated || false,
            orderFormApproved: itemJson.order_form_approved || false,
            customBOM: itemJson.custom_bom || null,
            timeline,
            createdAt: itemJson.created_at || itemJson.createdAt,
            updatedAt: itemJson.updated_at || itemJson.updatedAt,
        },
    };
}

// =========================================================================
// POST /api/fabrication/items/:itemId/custom-bom
// Create a custom BOM for an order item
// =========================================================================

async function createCustomBOM(itemId, data, user) {
    const item = await OrderItem.findByPk(itemId);
    if (!item) {
        throw serviceError("Order item not found", 404, "ORDER_ITEM_NOT_FOUND");
    }

    if (item.status !== ORDER_ITEM_STATUS.FABRICATION_BESPOKE) {
        throw serviceError(
            "Custom BOM can only be created for items in FABRICATION_BESPOKE status",
            400,
            "INVALID_STATUS"
        );
    }

    if (item.custom_bom) {
        throw serviceError(
            "Custom BOM already exists for this item. Use PUT to update.",
            400,
            "BOM_EXISTS"
        );
    }

    const now = new Date().toISOString();
    const createdBy = data.createdBy || user?.name || "System";

    // Derive pieces from included_items + selected_add_ons
    const pieces = [
        ...(item.included_items || []).map((i) => i.piece),
        ...(item.selected_add_ons || []).map((a) => a.piece),
    ];

    const customBOM = {
        id: `custom-bom-${itemId}`,
        orderItemId: itemId,
        pieces,
        items: data.items || [],
        createdAt: now,
        createdBy,
        updatedAt: now,
        updatedBy: createdBy,
    };

    await item.update({ custom_bom: customBOM });

    // Log activity
    await OrderActivity.log({
        orderId: item.order_id,
        orderItemId: itemId,
        action: "Custom BOM created",
        actionType: ACTIVITY_ACTION_TYPE.FABRICATION,
        userId: user?.id || null,
        userName: user?.name || "System",
    });

    // Re-fetch to get fresh data
    const updated = await OrderItem.findByPk(itemId);
    return serializeOrderItem(item);
}

// =========================================================================
// PUT /api/fabrication/items/:itemId/custom-bom
// Update an existing custom BOM (bulk update items array)
// =========================================================================

async function updateCustomBOM(itemId, data, user) {
    const item = await OrderItem.findByPk(itemId);
    if (!item) {
        throw serviceError("Order item not found", 404, "ORDER_ITEM_NOT_FOUND");
    }

    if (item.status !== ORDER_ITEM_STATUS.FABRICATION_BESPOKE) {
        throw serviceError(
            "Custom BOM can only be edited while item is in FABRICATION_BESPOKE status",
            400,
            "INVALID_STATUS"
        );
    }

    if (!item.custom_bom) {
        throw serviceError(
            "No custom BOM exists for this item. Use POST to create.",
            400,
            "NO_BOM"
        );
    }

    const now = new Date().toISOString();
    const updatedBy = data.updatedBy || user?.name || "System";

    const updatedBOM = {
        ...item.custom_bom,
        items: data.items || item.custom_bom.items,
        updatedAt: now,
        updatedBy,
    };

    await item.update({ custom_bom: updatedBOM });

    // Re-fetch to get fresh data
    const updated = await OrderItem.findByPk(itemId);
    return serializeOrderItem(item);
}

// =========================================================================
// POST /api/fabrication/items/:itemId/custom-bom/pieces/:piece/items
// Add a BOM item to a specific piece section
// =========================================================================

async function addBOMItem(itemId, piece, data, user) {
    const item = await OrderItem.findByPk(itemId);
    if (!item) {
        throw serviceError("Order item not found", 404, "ORDER_ITEM_NOT_FOUND");
    }

    if (item.status !== ORDER_ITEM_STATUS.FABRICATION_BESPOKE) {
        throw serviceError(
            "Cannot modify BOM - item is not in FABRICATION_BESPOKE status",
            400,
            "INVALID_STATUS"
        );
    }

    const now = new Date().toISOString();
    const addedBy = data.addedBy || user?.name || "System";

    // Auto-initialize BOM if it doesn't exist
    let customBOM = item.custom_bom;
    if (!customBOM) {
        const pieces = [
            ...(item.included_items || []).map((i) => i.piece),
            ...(item.selected_add_ons || []).map((a) => a.piece),
        ];
        customBOM = {
            id: `custom-bom-${itemId}`,
            orderItemId: itemId,
            pieces,
            items: [],
            createdAt: now,
            createdBy: addedBy,
            updatedAt: now,
            updatedBy: addedBy,
        };
    }

    const newBOMItem = {
        id: generateBomItemId(),
        piece,
        inventory_item_id: data.inventory_item_id,
        inventory_item_name: data.inventory_item_name || "",
        inventory_item_sku: data.inventory_item_sku || "",
        quantity: parseFloat(data.quantity),
        unit: data.unit,
        notes: data.notes || "",
        createdAt: now,
    };

    customBOM.items.push(newBOMItem);
    customBOM.updatedAt = now;
    customBOM.updatedBy = addedBy;

    await item.update({ custom_bom: customBOM });

    // Re-fetch to get fresh data
    const updated = await OrderItem.findByPk(itemId);
    return {
        item: serializeOrderItem(updated),
        bomItem: newBOMItem,
    };
}

// =========================================================================
// PUT /api/fabrication/items/:itemId/custom-bom/pieces/:piece/items/:bomItemId
// Update a specific BOM item
// =========================================================================

async function updateBOMItem(itemId, piece, bomItemId, data, user) {
    const item = await OrderItem.findByPk(itemId);
    if (!item) {
        throw serviceError("Order item not found", 404, "ORDER_ITEM_NOT_FOUND");
    }

    if (item.status !== ORDER_ITEM_STATUS.FABRICATION_BESPOKE) {
        throw serviceError(
            "Cannot modify BOM - item is not in FABRICATION_BESPOKE status",
            400,
            "INVALID_STATUS"
        );
    }

    if (!item.custom_bom) {
        throw serviceError("No custom BOM exists", 404, "NO_BOM");
    }

    const bomItemIndex = item.custom_bom.items.findIndex(
        (bi) => bi.id === bomItemId && bi.piece === piece
    );
    if (bomItemIndex === -1) {
        throw serviceError("BOM item not found", 404, "BOM_ITEM_NOT_FOUND");
    }

    const now = new Date().toISOString();
    const updatedBy = data.updatedBy || user?.name || "System";

    const updatedItems = [...item.custom_bom.items];
    updatedItems[bomItemIndex] = {
        ...updatedItems[bomItemIndex],
        inventory_item_id: data.inventory_item_id,
        inventory_item_name: data.inventory_item_name || "",
        inventory_item_sku: data.inventory_item_sku || "",
        quantity: parseFloat(data.quantity),
        unit: data.unit,
        notes: data.notes || "",
        updatedAt: now,
    };

    const updatedBOM = {
        ...item.custom_bom,
        items: updatedItems,
        updatedAt: now,
        updatedBy,
    };

    await item.update({ custom_bom: updatedBOM });

    // Re-fetch to get fresh data
    const updated = await OrderItem.findByPk(itemId);
    return serializeOrderItem(updated);
}

// =========================================================================
// DELETE /api/fabrication/items/:itemId/custom-bom/pieces/:piece/items/:bomItemId
// Remove a BOM item
// =========================================================================

async function deleteBOMItem(itemId, piece, bomItemId) {
    const item = await OrderItem.findByPk(itemId);
    if (!item) {
        throw serviceError("Order item not found", 404, "ORDER_ITEM_NOT_FOUND");
    }

    if (item.status !== ORDER_ITEM_STATUS.FABRICATION_BESPOKE) {
        throw serviceError(
            "Cannot modify BOM - item is not in FABRICATION_BESPOKE status",
            400,
            "INVALID_STATUS"
        );
    }

    if (!item.custom_bom) {
        throw serviceError("No custom BOM exists", 404, "NO_BOM");
    }

    const bomItemIndex = item.custom_bom.items.findIndex(
        (bi) => bi.id === bomItemId && bi.piece === piece
    );
    if (bomItemIndex === -1) {
        throw serviceError("BOM item not found", 404, "BOM_ITEM_NOT_FOUND");
    }

    const now = new Date().toISOString();
    const updatedItems = item.custom_bom.items.filter(
        (bi) => !(bi.id === bomItemId && bi.piece === piece)
    );

    const updatedBOM = {
        ...item.custom_bom,
        items: updatedItems,
        updatedAt: now,
    };

    await item.update({ custom_bom: updatedBOM });

    // Re-fetch to get fresh data
    const updated = await OrderItem.findByPk(itemId);
    return serializeOrderItem(updated);
}

// =========================================================================
// POST /api/fabrication/items/:itemId/custom-bom/submit
// Submit the custom BOM → transition item to INVENTORY_CHECK
// =========================================================================

async function submitCustomBOM(itemId, data, user) {
    const item = await OrderItem.findByPk(itemId);
    if (!item) {
        throw serviceError("Order item not found", 404, "ORDER_ITEM_NOT_FOUND");
    }

    if (item.status !== ORDER_ITEM_STATUS.FABRICATION_BESPOKE) {
        throw serviceError(
            "Item is not in FABRICATION_BESPOKE status",
            400,
            "INVALID_STATUS"
        );
    }

    if (!item.custom_bom || !item.custom_bom.items || item.custom_bom.items.length === 0) {
        throw serviceError(
            "Custom BOM must have at least one item before submitting",
            400,
            "EMPTY_BOM"
        );
    }

    const now = new Date().toISOString();
    const submittedBy = data.submittedBy || user?.name || "System";

    // Update BOM with submission info and transition status
    const updatedBOM = {
        ...item.custom_bom,
        submittedAt: now,
        submittedBy,
    };

    await item.update({
        custom_bom: updatedBOM,
        status: ORDER_ITEM_STATUS.INVENTORY_CHECK,
    });

    // Log activity
    await OrderActivity.log({
        orderId: item.order_id,
        orderItemId: itemId,
        action: "Custom BOM submitted - Ready for inventory check",
        actionType: ACTIVITY_ACTION_TYPE.FABRICATION,
        userId: user?.id || null,
        userName: submittedBy,
    });

    // Update parent order timestamp
    await Order.update(
        { updated_at: now },
        { where: { id: item.order_id } }
    );

    // Re-fetch to get fresh data
    const updated = await OrderItem.findByPk(itemId);
    return serializeOrderItem(updated);
}

// =========================================================================
// Exports
// =========================================================================

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
