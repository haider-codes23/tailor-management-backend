/**
 * Inventory Check Service
 *
 * Core engine for Phase 9: BOM-based material checking per section.
 *
 * Two main operations:
 *   1. runInventoryCheck  — Initial check when item enters INVENTORY_CHECK
 *   2. rerunSectionCheck  — Re-check AWAITING_MATERIAL sections after stock-in
 *
 * Logic mirrors the MSW ordersHandlers.js inventory-check handler exactly:
 *   - Builds sections from includedItems + selectedAddOns
 *   - Loads BOM items (standard BOM or custom BOM)
 *   - Checks each section independently against inventory
 *   - Deducts stock for passed sections, creates procurement demands for failed
 *   - Three outcomes: ALL passed → CREATE_PACKET, PARTIAL → PARTIAL_CREATE_PACKET,
 *     ALL failed → AWAITING_MATERIAL
 *   - Creates inventory movements for stock deductions
 *   - Updates section_statuses JSONB on the order item
 */

const { Op } = require("sequelize");
const {
  sequelize,
  OrderItem,
  OrderItemSection,
  OrderActivity,
  Order,
  Bom,
  BomItem,
  InventoryItem,
  InventoryMovement,
  ProcurementDemand,
} = require("../models");

const {
  ORDER_ITEM_STATUS,
  SECTION_STATUS,
  SECTION_TYPE,
  ACTIVITY_ACTION_TYPE,
  SIZE_TYPE,
} = require("../constants/order");

// =========================================================================
// Helpers
// =========================================================================

function serviceError(msg, status = 400, code = "INVENTORY_CHECK_ERROR") {
  const err = new Error(msg);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Get BOM items for an order item.
 * For CUSTOM size items with a customBOM, use that.
 * For STANDARD size items, find the active BOM for the product.
 * Returns BOM items enriched with inventory item details.
 */
async function getBOMItemsForOrderItem(item) {
  // Custom BOM path (fabrication/bespoke items)
  if (
    item.size_type?.toLowerCase() === SIZE_TYPE.CUSTOM &&
    item.custom_bom &&
    item.custom_bom.items &&
    item.custom_bom.items.length > 0
  ) {
    // Custom BOM items are stored as JSONB on the order item
    // Each item has: inventory_item_id, inventory_item_name, inventory_item_sku,
    //                quantity, unit, piece
    const enriched = [];
    for (const cbi of item.custom_bom.items) {
      const invItem = await InventoryItem.findByPk(cbi.inventory_item_id);
      enriched.push({
        inventory_item_id: cbi.inventory_item_id,
        inventory_item_name: cbi.inventory_item_name || invItem?.name || "Unknown",
        inventory_item_sku: cbi.inventory_item_sku || invItem?.sku || "",
        quantity_per_unit: parseFloat(cbi.quantity) || parseFloat(cbi.quantity_per_unit) || 0,
        unit: cbi.unit || invItem?.unit || "Unit",
        piece: (cbi.piece || "").toLowerCase(),
        remaining_stock: invItem ? parseFloat(invItem.remaining_stock) || 0 : 0,
      });
    }
    return enriched;
  }

  // Standard BOM path
  let bom = null;

  if (item.bom_id) {
    bom = await Bom.findByPk(item.bom_id, {
      include: [
        {
          model: BomItem,
          as: "items",
          include: [
            {
              model: InventoryItem,
              as: "inventoryItem",
              attributes: ["id", "name", "sku", "unit", "remaining_stock", "category"],
            },
          ],
        },
      ],
    });
  }

  if (!bom && item.product_id) {
    const where = { product_id: item.product_id, is_active: true };
    bom = await Bom.findOne({
      where,
      include: [
        {
          model: BomItem,
          as: "items",
          include: [
            {
              model: InventoryItem,
              as: "inventoryItem",
              attributes: ["id", "name", "sku", "unit", "remaining_stock", "category"],
            },
          ],
        },
      ],
    });
  }

  if (!bom || !bom.items || bom.items.length === 0) {
    return [];
  }

  return bom.items.map((bi) => {
    const inv = bi.inventoryItem;
    return {
      inventory_item_id: bi.inventory_item_id,
      inventory_item_name: inv?.name || "Unknown",
      inventory_item_sku: inv?.sku || "",
      quantity_per_unit: parseFloat(bi.quantity_per_unit) || 0,
      unit: bi.unit || inv?.unit || "Unit",
      piece: (bi.piece || "").toLowerCase(),
      remaining_stock: inv ? parseFloat(inv.remaining_stock) || 0 : 0,
    };
  });
}

/**
 * Build sections array from order item's includedItems + selectedAddOns.
 * Matches the MSW handler logic exactly.
 */
function buildSections(item) {
  const sections = [];
  const includedItems = item.included_items || [];
  const selectedAddOns = item.selected_add_ons || [];

  for (const inc of includedItems) {
    sections.push({
      piece: inc.piece,
      type: SECTION_TYPE.MAIN,
      price: inc.price || 0,
    });
  }
  for (const addon of selectedAddOns) {
    sections.push({
      piece: addon.piece,
      type: SECTION_TYPE.ADD_ON,
      price: addon.price || 0,
    });
  }
  return sections;
}

// =========================================================================
// A. RUN INVENTORY CHECK
// =========================================================================

/**
 * Run inventory check on an order item. Per-section BOM checking.
 *
 * @param {string} orderItemId - The order item UUID
 * @param {Object} data - { checkedBy } from the request body
 * @param {Object} user - Authenticated user
 * @returns {Object} Full result matching MSW response shape
 */
async function runInventoryCheck(orderItemId, data, user) {
  const item = await OrderItem.findByPk(orderItemId, {
    include: [{ model: OrderItemSection, as: "sections" }],
  });

  if (!item) {
    throw serviceError("Order item not found", 404, "ORDER_ITEM_NOT_FOUND");
  }

  // Validate status — must be in INVENTORY_CHECK
  if (item.status !== ORDER_ITEM_STATUS.INVENTORY_CHECK) {
    throw serviceError(
      `Order item must be in INVENTORY_CHECK status to run check. Current: ${item.status}`,
      400,
      "INVALID_STATUS"
    );
  }

  const t = await sequelize.transaction();

  try {
    const now = new Date();
    const sections = buildSections(item);

    if (sections.length === 0) {
      throw serviceError(
        "No sections (included items / add-ons) found on this order item",
        400,
        "NO_SECTIONS"
      );
    }

    // Get all BOM items for this order item
    const allBOMItems = await getBOMItemsForOrderItem(item);


    console.log("🔍 allBOMItems count:", allBOMItems.length);
    console.log("🔍 allBOMItems:", JSON.stringify(allBOMItems.map(b => ({ piece: b.piece, name: b.inventory_item_name })), null, 2));

    // If no BOM items at all, fail the check

    // If no BOM items at all, fail the check — product needs BOM configured
    if (allBOMItems.length === 0) {
      await t.rollback();
      const err = new Error("No BOM (Bill of Materials) found for this product. Please configure the BOM before running inventory check.");
      err.status = 400;
      err.code = "NO_BOM_CONFIGURED";
      throw err;
    }

    // Clear existing procurement demands for this item
    await ProcurementDemand.destroy({
      where: { order_item_id: orderItemId },
      transaction: t,
    });

    // Process each section independently
    const sectionResults = [];
    const passedSections = [];
    const failedSections = [];
    const allMaterialRequirements = [];
    const allShortages = [];
    const stockDeductions = [];
    const quantity = item.quantity || 1;

    // Build updated sectionStatuses JSONB
    const sectionStatuses = { ...(item.section_statuses || {}) };

    for (const section of sections) {
      const sectionPiece = section.piece.toLowerCase();

      // Filter BOM items for this section
      const sectionBOMItems = allBOMItems.filter(
        (bom) => bom.piece === sectionPiece
      );

      // Calculate requirements for this section
      const sectionRequirements = [];
      const sectionShortages = [];

      for (const bomItem of sectionBOMItems) {
        // Re-fetch inventory item to get fresh stock (inside transaction)
        const invItem = await InventoryItem.findByPk(bomItem.inventory_item_id, {
          transaction: t,
          lock: t.LOCK.UPDATE, // Lock row to prevent race conditions
        });

        const requiredQty = bomItem.quantity_per_unit * quantity;
        const availableQty = invItem ? parseFloat(invItem.remaining_stock) || 0 : 0;
        const shortageQty = Math.max(0, requiredQty - availableQty);
        const status = availableQty >= requiredQty ? "SUFFICIENT" : "SHORTAGE";

        const req = {
          inventoryItemId: bomItem.inventory_item_id,
          inventoryItemName: bomItem.inventory_item_name,
          inventoryItemSku: bomItem.inventory_item_sku,
          requiredQty,
          availableQty,
          shortageQty,
          unit: bomItem.unit,
          piece: section.piece,
          status,
        };

        sectionRequirements.push(req);
        allMaterialRequirements.push(req);

        if (status === "SHORTAGE") {
          sectionShortages.push(req);
          allShortages.push(req);
        }
      }

      // Determine if section passed
      const sectionPassed =
        sectionBOMItems.length > 0 && sectionShortages.length === 0;

      if (sectionPassed) {
        passedSections.push(sectionPiece);

        // Update section status
        sectionStatuses[sectionPiece] = {
          ...sectionStatuses[sectionPiece],
          status: SECTION_STATUS.INVENTORY_PASSED,
          updatedAt: now.toISOString(),
        };

        // Update the actual OrderItemSection record
        await OrderItemSection.update(
          {
            status: SECTION_STATUS.INVENTORY_PASSED,
            status_updated_at: now,
            status_updated_by: user?.id || null,
          },
          {
            where: {
              order_item_id: orderItemId,
              piece: { [Op.iLike]: sectionPiece },
            },
            transaction: t,
          }
        );

        // Deduct stock for passed sections
        for (const req of sectionRequirements) {
          if (req.requiredQty > 0) {
            const invItem = await InventoryItem.findByPk(req.inventoryItemId, {
              transaction: t,
              lock: t.LOCK.UPDATE,
            });

            if (invItem) {
              const previousStock = parseFloat(invItem.remaining_stock) || 0;
              const newStock = previousStock - req.requiredQty;

              await invItem.update(
                { remaining_stock: Math.max(0, newStock) },
                { transaction: t }
              );

              // Create inventory movement
              const movement = await InventoryMovement.create(
                {
                  inventory_item_id: req.inventoryItemId,
                  movement_type: "STOCK_OUT",
                  quantity: req.requiredQty,
                  remaining_after: Math.max(0, newStock),
                  reference_type: "ORDER_ITEM",
                  reference_id: orderItemId,
                  notes: `Reserved for order item ${orderItemId}, section: ${section.piece}`,
                  performed_by: user?.id || null,
                  transaction_date: now,
                },
                { transaction: t }
              );

              stockDeductions.push({
                inventoryItemId: req.inventoryItemId,
                inventoryItemName: req.inventoryItemName,
                deductedQty: req.requiredQty,
                previousStock,
                newStock: Math.max(0, newStock),
                piece: section.piece,
                movementId: movement.id,
              });
            }
          }
        }

        sectionResults.push({
          piece: sectionPiece,
          passed: true,
          requirements: sectionRequirements,
        });
      } else {
        failedSections.push(sectionPiece);

        // Update section status
        sectionStatuses[sectionPiece] = {
          ...sectionStatuses[sectionPiece],
          status: SECTION_STATUS.AWAITING_MATERIAL,
          updatedAt: now.toISOString(),
        };

        // Update the actual OrderItemSection record
        await OrderItemSection.update(
          {
            status: SECTION_STATUS.AWAITING_MATERIAL,
            status_updated_at: now,
            status_updated_by: user?.id || null,
          },
          {
            where: {
              order_item_id: orderItemId,
              piece: { [Op.iLike]: sectionPiece },
            },
            transaction: t,
          }
        );

        // Create procurement demands for shortages
        for (const shortage of sectionShortages) {
          await ProcurementDemand.create(
            {
              order_id: item.order_id,
              order_item_id: orderItemId,
              inventory_item_id: shortage.inventoryItemId,
              inventory_item_name: shortage.inventoryItemName,
              inventory_item_sku: shortage.inventoryItemSku,
              required_qty: shortage.requiredQty,
              available_qty: shortage.availableQty,
              shortage_qty: shortage.shortageQty,
              unit: shortage.unit,
              affected_section: sectionPiece,
              status: "OPEN",
            },
            { transaction: t }
          );
        }

        sectionResults.push({
          piece: sectionPiece,
          passed: false,
          requirements: sectionRequirements,
          shortages: sectionShortages,
        });
      }
    }

    // ── Determine overall status ──────────────────────────────────────
    let nextStatus;
    let timelineAction;

    if (passedSections.length === sections.length && sections.length > 0) {
      // ALL passed → CREATE_PACKET
      nextStatus = ORDER_ITEM_STATUS.CREATE_PACKET;
      timelineAction = `Inventory check passed for all sections (${passedSections.join(", ")}). Ready for packet creation.`;
    } else if (passedSections.length > 0) {
      // PARTIAL — some passed, some failed
      nextStatus = ORDER_ITEM_STATUS.PARTIAL_CREATE_PACKET;
      timelineAction = `Partial inventory check: ${passedSections.join(", ")} passed. ${failedSections.join(", ")} awaiting material.`;
    } else {
      // ALL failed → AWAITING_MATERIAL
      nextStatus = ORDER_ITEM_STATUS.AWAITING_MATERIAL;
      timelineAction = `Inventory check failed for all sections. ${allShortages.length} material shortage(s).`;
    }

    // Update order item
    await item.update(
      {
        status: nextStatus,
        section_statuses: sectionStatuses,
        updated_at: now,
      },
      { transaction: t }
    );

    // Update parent order status
    await Order.update(
      { status: nextStatus, updated_at: now },
      { where: { id: item.order_id }, transaction: t }
    );

    // Log activity
    await OrderActivity.log({
      orderId: item.order_id,
      orderItemId: orderItemId,
      action: timelineAction,
      actionType: ACTIVITY_ACTION_TYPE.INVENTORY_CHECK,
      userId: user?.id || null,
      userName: data?.checkedBy || user?.name || "System",
      details: {
        passedSections,
        failedSections,
        shortageCount: allShortages.length,
        deductionCount: stockDeductions.length,
      },
      transaction: t,
    });

    await t.commit();

    // Re-fetch the updated item with sections
    const updatedItem = await OrderItem.findByPk(orderItemId, {
      include: [{ model: OrderItemSection, as: "sections" }],
    });

    return {
      item: updatedItem,
      sectionResults,
      passedSections,
      failedSections,
      materialRequirements: allMaterialRequirements,
      shortages: allShortages,
      stockDeductions,
      nextStatus,
      procurementDemandsCreated: allShortages.length,
      packet: null, // Packet creation is Phase 10
      packetCreated: false,
    };
  } catch (err) {
    try { await t.rollback(); } catch (_) { /* already rolled back */ }
    throw err;
  }
}

// =========================================================================
// B. RERUN SECTION INVENTORY CHECK
// =========================================================================

/**
 * Re-run inventory check for sections in AWAITING_MATERIAL status.
 * Called after procurement demands are fulfilled / stock-in done.
 *
 * @param {string} orderItemId
 * @param {Object} data - { checkedBy }
 * @param {Object} user
 */
async function rerunSectionCheck(orderItemId, data, user) {
  const item = await OrderItem.findByPk(orderItemId, {
    include: [{ model: OrderItemSection, as: "sections" }],
  });

  if (!item) {
    throw serviceError("Order item not found", 404, "ORDER_ITEM_NOT_FOUND");
  }

  // Find sections in AWAITING_MATERIAL or PENDING_INVENTORY_CHECK
  const sectionStatuses = item.section_statuses || {};
  const sectionsToRecheck = [];

  Object.entries(sectionStatuses).forEach(([sectionName, sectionData]) => {
    if (
      sectionData.status === SECTION_STATUS.AWAITING_MATERIAL ||
      sectionData.status === SECTION_STATUS.PENDING_INVENTORY_CHECK
    ) {
      sectionsToRecheck.push(sectionName);
    }
  });

  if (sectionsToRecheck.length === 0) {
    throw serviceError(
      "No sections in AWAITING_MATERIAL or PENDING_INVENTORY_CHECK status to recheck",
      400,
      "NO_SECTIONS_TO_RECHECK"
    );
  }

  const t = await sequelize.transaction();

  try {
    const now = new Date();
    const allBOMItems = await getBOMItemsForOrderItem(item);

    // Check procurement demands status for this item
    const demandsForItem = await ProcurementDemand.findAll({
      where: { order_item_id: orderItemId },
    });

    const sectionResults = [];
    const passedSections = [];
    const stillFailedSections = [];
    const newMaterialRequirements = [];
    const stockDeductions = [];
    const quantity = item.quantity || 1;

    const updatedSectionStatuses = { ...sectionStatuses };

    for (const sectionName of sectionsToRecheck) {
      const sectionPiece = sectionName.toLowerCase();

      // Check if there are still unfulfilled procurement demands for this section
      const sectionDemands = demandsForItem.filter(
        (pd) =>
          (pd.affected_section || "").toLowerCase() === sectionPiece &&
          pd.status !== "RECEIVED" &&
          pd.status !== "CANCELLED" &&
          pd.status !== "FULFILLED"
      );

      // Filter BOM items for this section
      const sectionBOMItems = allBOMItems.filter(
        (bom) => bom.piece === sectionPiece
      );

      // Calculate requirements
      const sectionRequirements = [];
      const sectionShortages = [];

      for (const bomItem of sectionBOMItems) {
        const invItem = await InventoryItem.findByPk(bomItem.inventory_item_id, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        const requiredQty = bomItem.quantity_per_unit * quantity;
        const availableQty = invItem ? parseFloat(invItem.remaining_stock) || 0 : 0;
        const shortageQty = Math.max(0, requiredQty - availableQty);
        const status = availableQty >= requiredQty ? "SUFFICIENT" : "SHORTAGE";

        const req = {
          inventoryItemId: bomItem.inventory_item_id,
          inventoryItemName: bomItem.inventory_item_name,
          inventoryItemSku: bomItem.inventory_item_sku,
          requiredQty,
          availableQty,
          shortageQty,
          unit: bomItem.unit,
          piece: sectionName,
          status,
        };

        sectionRequirements.push(req);
        newMaterialRequirements.push(req);

        if (status === "SHORTAGE") {
          sectionShortages.push(req);
        }
      }

      const sectionPassed =
        sectionBOMItems.length > 0 && sectionShortages.length === 0;

      if (sectionPassed) {
        passedSections.push(sectionPiece);

        updatedSectionStatuses[sectionPiece] = {
          ...updatedSectionStatuses[sectionPiece],
          status: SECTION_STATUS.INVENTORY_PASSED,
          updatedAt: now.toISOString(),
        };

        await OrderItemSection.update(
          {
            status: SECTION_STATUS.INVENTORY_PASSED,
            status_updated_at: now,
            status_updated_by: user?.id || null,
          },
          {
            where: {
              order_item_id: orderItemId,
              piece: { [Op.iLike]: sectionPiece },
            },
            transaction: t,
          }
        );

        // Deduct stock
        for (const req of sectionRequirements) {
          if (req.requiredQty > 0) {
            const invItem = await InventoryItem.findByPk(req.inventoryItemId, {
              transaction: t,
              lock: t.LOCK.UPDATE,
            });

            if (invItem) {
              const previousStock = parseFloat(invItem.remaining_stock) || 0;
              const newStock = previousStock - req.requiredQty;

              await invItem.update(
                { remaining_stock: Math.max(0, newStock) },
                { transaction: t }
              );

              const movement = await InventoryMovement.create(
                {
                  inventory_item_id: req.inventoryItemId,
                  movement_type: "STOCK_OUT",
                  quantity: req.requiredQty,
                  remaining_after: Math.max(0, newStock),
                  reference_type: "ORDER_ITEM",
                  reference_id: orderItemId,
                  notes: `Reserved for order item ${orderItemId}, section: ${sectionName}`,
                  performed_by: user?.id || null,
                  transaction_date: now,
                },
                { transaction: t }
              );

              stockDeductions.push({
                inventoryItemId: req.inventoryItemId,
                inventoryItemName: req.inventoryItemName,
                deductedQty: req.requiredQty,
                previousStock,
                newStock: Math.max(0, newStock),
                piece: sectionName,
                movementId: movement.id,
              });
            }
          }
        }

        // Mark fulfilled procurement demands for this section
        await ProcurementDemand.update(
          { status: "FULFILLED", updated_at: now },
          {
            where: {
              order_item_id: orderItemId,
              affected_section: { [Op.iLike]: sectionPiece },
              status: { [Op.notIn]: ["CANCELLED"] },
            },
            transaction: t,
          }
        );

        sectionResults.push({
          piece: sectionPiece,
          passed: true,
          requirements: sectionRequirements,
        });
      } else {
        stillFailedSections.push(sectionPiece);

        updatedSectionStatuses[sectionPiece] = {
          ...updatedSectionStatuses[sectionPiece],
          status: SECTION_STATUS.AWAITING_MATERIAL,
          updatedAt: now.toISOString(),
        };

        sectionResults.push({
          piece: sectionPiece,
          passed: false,
          requirements: sectionRequirements,
          shortages: sectionShortages,
        });
      }
    }

    // Determine overall item status after rerun
    // Check ALL sections (not just rechecked ones) to determine overall status
    const allSectionStatuses = Object.values(updatedSectionStatuses);
    const allPassed = allSectionStatuses.every(
      (s) =>
        s.status === SECTION_STATUS.INVENTORY_PASSED ||
        s.status === SECTION_STATUS.PACKET_CREATED ||
        s.status === SECTION_STATUS.PACKET_VERIFIED
    );
    const somePassed = allSectionStatuses.some(
      (s) => s.status === SECTION_STATUS.INVENTORY_PASSED
    );
    const someAwaiting = allSectionStatuses.some(
      (s) => s.status === SECTION_STATUS.AWAITING_MATERIAL
    );

    let nextStatus = item.status; // default: keep current
    if (allPassed) {
      nextStatus = ORDER_ITEM_STATUS.CREATE_PACKET;
    } else if (somePassed && someAwaiting) {
      nextStatus = ORDER_ITEM_STATUS.PARTIAL_CREATE_PACKET;
    } else if (someAwaiting) {
      nextStatus = ORDER_ITEM_STATUS.AWAITING_MATERIAL;
    }

    // Update order item
    await item.update(
      {
        status: nextStatus,
        section_statuses: updatedSectionStatuses,
        updated_at: now,
      },
      { transaction: t }
    );

    // Update parent order
    await Order.update(
      { status: nextStatus, updated_at: now },
      { where: { id: item.order_id }, transaction: t }
    );

    // Log activity
    const timelineAction = passedSections.length > 0
      ? `Re-run inventory check: ${passedSections.join(", ")} now passed. ${stillFailedSections.length > 0 ? stillFailedSections.join(", ") + " still awaiting material." : "All sections cleared."}`
      : `Re-run inventory check: no sections passed yet.`;

    await OrderActivity.log({
      orderId: item.order_id,
      orderItemId,
      action: timelineAction,
      actionType: ACTIVITY_ACTION_TYPE.INVENTORY_CHECK,
      userId: user?.id || null,
      userName: data?.checkedBy || user?.name || "System",
      details: {
        passedSections,
        stillFailedSections,
        deductionCount: stockDeductions.length,
        isRerun: true,
      },
      transaction: t,
    });

    await t.commit();

    // Re-fetch
    const updatedItem = await OrderItem.findByPk(orderItemId, {
      include: [{ model: OrderItemSection, as: "sections" }],
    });

    return {
      item: updatedItem,
      sectionResults,
      passedSections,
      failedSections: stillFailedSections,
      materialRequirements: newMaterialRequirements,
      stockDeductions,
      nextStatus,
    };
  } catch (err) {
    try { await t.rollback(); } catch (_) { /* already rolled back */ }
    throw err;
  }
}

// =========================================================================
// Exports
// =========================================================================

module.exports = {
  runInventoryCheck,
  rerunSectionCheck,
};