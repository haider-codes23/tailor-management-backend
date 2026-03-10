"use strict";

const crypto = require("crypto");

/**
 * Seeder: BOMs + BOM Items
 *
 * Mirrors the frontend mockProducts.js generateBOMs() and generateBOMItems() logic.
 *
 * What gets seeded:
 *   - 18 BOMs (9 products × 2 sizes: M and L)
 *   - ~200+ BOM items (each piece in each BOM gets 1-3 materials)
 *
 * Dependencies (must run AFTER):
 *   1. seed-users.js          — for created_by FK
 *   2. seed-products.js       — product UUIDs
 *   3. seed-inventory.js      — inventory item UUIDs
 *
 * UUID conventions:
 *   - Products: SHA256-based deterministicUUID("product-{SKU}")
 *   - Inventory: MD5-based makeUUID("inv", idx)
 *   - BOMs: MD5-based makeUUID("bom", counter)
 *   - BOM Items: MD5-based makeUUID("bom-item", counter)
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    // =========================================================================
    // UUID helpers — must match the exact algorithms used in other seeders
    // =========================================================================

    // Products seeder uses SHA256
    function productUUID(sku) {
      const hash = crypto.createHash("sha256").update(`product-${sku}`).digest("hex");
      return [
        hash.substring(0, 8),
        hash.substring(8, 12),
        "4" + hash.substring(13, 16),
        "a" + hash.substring(17, 20),
        hash.substring(20, 32),
      ].join("-");
    }

    // Inventory seeder uses MD5
    function invUUID(idx) {
      const hash = crypto.createHash("md5").update(`inv-${idx}`).digest("hex");
      return [
        hash.slice(0, 8),
        hash.slice(8, 12),
        "4" + hash.slice(13, 16),
        "8" + hash.slice(17, 20),
        hash.slice(20, 32),
      ].join("-");
    }

    // BOM + BOM item UUIDs
    function bomUUID(idx) {
      const hash = crypto.createHash("md5").update(`bom-${idx}`).digest("hex");
      return [
        hash.slice(0, 8),
        hash.slice(8, 12),
        "4" + hash.slice(13, 16),
        "8" + hash.slice(17, 20),
        hash.slice(20, 32),
      ].join("-");
    }

    function bomItemUUID(idx) {
      const hash = crypto.createHash("md5").update(`bom-item-${idx}`).digest("hex");
      return [
        hash.slice(0, 8),
        hash.slice(8, 12),
        "4" + hash.slice(13, 16),
        "8" + hash.slice(17, 20),
        hash.slice(20, 32),
      ].join("-");
    }

    // =========================================================================
    // Look up admin user for created_by
    // =========================================================================
    const [users] = await queryInterface.sequelize.query(
      `SELECT id FROM users WHERE email = 'admin@tailor.com' LIMIT 1;`
    );
    const adminId = users.length > 0 ? users[0].id : null;

    // =========================================================================
    // Product definitions (must match seed-products.js exactly)
    // =========================================================================
    const products = [
      { sku: "AP-001", name: "Aqua Princess",     pieces: ["peshwas"],                         addOns: ["dupatta", "pouch"] },
      { sku: "RE-002", name: "Royal Ember",        pieces: ["shirt", "lehnga"],                 addOns: ["dupatta", "pouch"] },
      { sku: "PS-003", name: "Princess Solara",    pieces: ["kaftan"],                          addOns: ["pouch"] },
      { sku: "RS-004", name: "Royal Sapphire",     pieces: ["shirt", "sharara"],                addOns: ["dupatta", "pouch"] },
      { sku: "EV-005", name: "Elysian Verde",      pieces: ["shirt", "farshi", "sharara"],      addOns: ["dupatta", "shawl", "pouch"] },
      { sku: "DD-006", name: "Drape of Divinity",  pieces: ["saree", "peti_coat", "blouse"],    addOns: ["pouch"] },
      { sku: "CM-007", name: "Coral Mirage",       pieces: ["blouse", "sharara"],               addOns: ["dupatta", "pouch"] },
      { sku: "MB-008", name: "Midnight Bloom",     pieces: ["shirt", "lehnga"],                 addOns: ["dupatta", "pouch"] },
      { sku: "AE-009", name: "Aqua Elegance",      pieces: ["kaftan"],                          addOns: ["pouch"] },
    ];

    // =========================================================================
    // Valid inventory IDs for BOM items (same as mockProducts.js validInventoryIds)
    // These are the numeric indexes used in the inventory seeder
    // =========================================================================
    const validInventoryIdxs = [
      1,  // Tissue Silk - FABRIC
      2,  // Kimkhab Fabric - FABRIC
      3,  // P Raw Silk - FABRIC (frontend calls it "Chiffon" at idx 3 in validIds but inv seeder maps idx 3 = P Raw Silk)
      4,  // Cotton Silk - FABRIC
      5,  // Chiffon - FABRIC
      6,  // Net Fabric - FABRIC
      7,  // Raw Silk Butti - FABRIC
      8,  // M.H Organza Embroidered - MULTI_HEAD
      9,  // Multi-head Border - MULTI_HEAD
      10, // Multi-head Ghera Border - MULTI_HEAD (inv seeder idx 10)
      11, // Multi-head Neckline - MULTI_HEAD
      12, // Multi-head Sleeve - MULTI_HEAD (inv seeder idx 12)
      13, // Champagne Karti - ADA_MATERIAL
      14, // Champagne Badaam - ADA_MATERIAL
      15, // Kulfi - ADA_MATERIAL
      16, // Behti - ADA_MATERIAL
      17, // Bajra Moti - ADA_MATERIAL
      18, // Betkhi Moti - ADA_MATERIAL
      24, // Antique Sitara - ADA_MATERIAL
      25, // Golden Sitara - ADA_MATERIAL
      36, // Lace - Golden - RAW_MATERIAL
      37, // Lace - Silver - RAW_MATERIAL
      38, // Badam Lace - RAW_MATERIAL
      39, // Tensel Organza - RAW_MATERIAL
      40, // Durka - RAW_MATERIAL
    ];

    // Unit lookup matching inventory items (for BOM item unit field)
    const unitByIdx = {};
    // FABRIC (1-7): Yard
    [1, 2, 3, 4, 5, 6, 7].forEach((i) => (unitByIdx[i] = "Yard"));
    // MULTI_HEAD (8-12): Yard or Piece
    [8, 9, 10, 12].forEach((i) => (unitByIdx[i] = "Yard"));
    unitByIdx[11] = "Piece"; // Neckline is per piece
    // ADA_MATERIAL (13-35): Gram
    [13, 14, 15, 16, 17, 18, 24, 25].forEach((i) => (unitByIdx[i] = "Gram"));
    // RAW_MATERIAL (36-42): Yard
    [36, 37, 38, 39, 40].forEach((i) => (unitByIdx[i] = "Yard"));

    // =========================================================================
    // Size scales (matching frontend generateBOMItems logic)
    // =========================================================================
    const sizeScales = { M: 0, L: 0.1 };
    const sizes = ["M", "L"];

    // =========================================================================
    // Generate BOMs (9 products × 2 sizes = 18 BOMs)
    // =========================================================================
    const bomRows = [];
    let bomCounter = 1;

    const bomMap = {}; // key: `${sku}-${size}` → bomId

    for (const product of products) {
      const productId = productUUID(product.sku);
      const allPieces = [...product.pieces, ...product.addOns];

      for (const size of sizes) {
        const bomId = bomUUID(bomCounter);
        bomMap[`${product.sku}-${size}`] = bomId;

        bomRows.push({
          id: bomId,
          product_id: productId,
          size: size,
          version: 1,
          is_active: true,
          name: `Size ${size} - Version 1`,
          notes: `Standard BOM for ${product.name} - Size ${size}`,
          pieces: JSON.stringify(allPieces),
          created_by: adminId,
          created_at: new Date("2024-01-15T10:00:00Z"),
          updated_at: new Date("2024-01-15T10:00:00Z"),
        });

        bomCounter++;
      }
    }

    await queryInterface.bulkInsert("boms", bomRows);

    // =========================================================================
    // Generate BOM Items (mirrors frontend generateBOMItems exactly)
    //
    // Logic per BOM:
    //   - Get all pieces for the product (items + add-ons)
    //   - For each piece:
    //       pouch → 1 material
    //       even index piece → 3 materials
    //       odd index piece → 2 materials
    //   - inventory_item picked by cycling through validInventoryIdxs:
    //       inventoryIndex = (pieceIdx * 3 + i) % validInventoryIdxs.length
    //   - quantity = 2.0 + scale * 0.3 + i * 0.5
    // =========================================================================
    const bomItemRows = [];
    let bomItemCounter = 1;

    for (const product of products) {
      const allPieces = [...product.pieces, ...product.addOns];

      for (const size of sizes) {
        const bomId = bomMap[`${product.sku}-${size}`];
        const scale = sizeScales[size];

        allPieces.forEach((piece, pieceIdx) => {
          const materialsPerPiece = piece === "pouch" ? 1 : pieceIdx % 2 === 0 ? 3 : 2;

          for (let i = 0; i < materialsPerPiece; i++) {
            const inventoryIndex = (pieceIdx * 3 + i) % validInventoryIdxs.length;
            const invIdx = validInventoryIdxs[inventoryIndex];

            bomItemRows.push({
              id: bomItemUUID(bomItemCounter),
              bom_id: bomId,
              inventory_item_id: invUUID(invIdx),
              piece: piece,
              quantity_per_unit: parseFloat((2.0 + scale * 0.3 + i * 0.5).toFixed(4)),
              unit: unitByIdx[invIdx] || "Unit",
              notes: `Material ${i + 1} for ${piece} - Size ${size}`,
              created_at: new Date("2024-01-15T10:00:00Z"),
              updated_at: new Date("2024-01-15T10:00:00Z"),
            });

            bomItemCounter++;
          }
        });
      }
    }

    await queryInterface.bulkInsert("bom_items", bomItemRows);

    console.log(`✅ Seeded ${bomRows.length} BOMs (${products.length} products × ${sizes.length} sizes)`);
    console.log(`✅ Seeded ${bomItemRows.length} BOM items`);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("bom_items", null, {});
    await queryInterface.bulkDelete("boms", null, {});
  },
};