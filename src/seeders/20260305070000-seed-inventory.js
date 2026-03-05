"use strict";

const crypto = require("crypto");

/**
 * Inventory Seed Data
 *
 * Seeds all 48 inventory items from mockInventory.js across 6 categories:
 *  - 7 FABRIC items       (IDs 1–7)
 *  - 6 MULTI_HEAD items   (IDs 8–13 mapped to 25–30 in frontend but we keep linear)
 *  - 22 ADDA_MATERIAL items
 *  - 7 RAW_MATERIAL items
 *  - 4 READY_STOCK items  (with variants)
 *  - 2 READY_SAMPLE items (with variants)
 *
 * Also seeds inventory_item_variants for READY_STOCK/READY_SAMPLE
 * and a handful of stock movements for audit trail.
 *
 * Uses deterministic UUIDs so other seeders (products, BOMs) can reference them.
 */

// ─── Deterministic UUID helper ──────────────────────────────────────────────
// Generates a stable UUID from a namespace + index so FKs work across seeders.
function makeUUID(prefix, index) {
  const hash = crypto
    .createHash("md5")
    .update(`${prefix}-${index}`)
    .digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "4" + hash.slice(13, 16),
    "8" + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

const now = new Date().toISOString();

module.exports = {
  async up(queryInterface) {
    // ── Look up admin user for performed_by in movements ──────────────
    const [users] = await queryInterface.sequelize.query(
      `SELECT id FROM users WHERE email = 'admin@tailor.com' LIMIT 1;`
    );
    const adminId = users.length > 0 ? users[0].id : null;

    // ── Look up production head for stock-out movements ───────────────
    const [prodUsers] = await queryInterface.sequelize.query(
      `SELECT id FROM users WHERE role = 'PRODUCTION_HEAD' LIMIT 1;`
    );
    const prodHeadId = prodUsers.length > 0 ? prodUsers[0].id : adminId;

    // ====================================================================
    // INVENTORY ITEMS
    // ====================================================================

    const items = [
      // ── FABRIC (7 items) ──────────────────────────────────────────────
      { idx: 1,  name: "Tissue Silk",          sku: "FAB-TISSUE-001",   cat: "FABRIC",       unit: "Yard", price: 850,  stock: 45,   min: 20,  vendor: "Silk House Karachi",       contact: "+92-300-1234567", rack: "A3",  desc: "Premium tissue silk fabric, lightweight and elegant.", notes: "Popular choice for bridal shirts and dupattas." },
      { idx: 2,  name: "Kimkhab Fabric",       sku: "FAB-KIMK-002",    cat: "FABRIC",       unit: "Yard", price: 950,  stock: 28,   min: 15,  vendor: "Premium Fabrics Ltd",      contact: "+92-321-9876543", rack: "A4",  desc: "Rich kimkhab fabric with metallic threads.", notes: "Heavy fabric, requires careful handling." },
      { idx: 3,  name: "P Raw Silk",           sku: "FAB-PRAW-003",    cat: "FABRIC",       unit: "Yard", price: 650,  stock: 55,   min: 25,  vendor: "Silk House Karachi",       contact: "+92-300-1234567", rack: "A2",  desc: "Pure raw silk with natural textured finish.", notes: "Good stock, popular for pants." },
      { idx: 4,  name: "Cotton Silk",          sku: "FAB-COTSILK-004", cat: "FABRIC",       unit: "Yard", price: 450,  stock: 72,   min: 30,  vendor: "Cotton Traders Lahore",    contact: "+92-333-5555666", rack: "A1",  desc: "Cotton silk blend, breathable and smooth.", notes: "High turnover item." },
      { idx: 5,  name: "Chiffon",              sku: "FAB-CHIFF-005",   cat: "FABRIC",       unit: "Yard", price: 350,  stock: 88,   min: 40,  vendor: "Fabric World",            contact: "+92-345-7778889", rack: "A5",  desc: "Light, sheer chiffon for dupattas and overlays.", notes: "Essential for dupatta production." },
      { idx: 6,  name: "Net Fabric",           sku: "FAB-NET-006",     cat: "FABRIC",       unit: "Yard", price: 280,  stock: 42,   min: 20,  vendor: "Fabric World",            contact: "+92-345-7778889", rack: "A6",  desc: "Mesh net fabric with fine weave.", notes: "Good for decorative work." },
      { idx: 7,  name: "Raw Silk Butti",       sku: "FAB-RAWBUTTI-007",cat: "FABRIC",       unit: "Yard", price: 720,  stock: 18,   min: 20,  vendor: "Silk House Karachi",       contact: "+92-300-1234567", rack: "A7",  desc: "Raw silk with pre-woven butti pattern.", notes: "ALERT: Below reorder level!" },

      // ── MULTI_HEAD (6 items) ──────────────────────────────────────────
      { idx: 8,  name: "M.H Organza Embroidered",  sku: "MH-ORG-008",       cat: "MULTI_HEAD",   unit: "Yard", price: 1200, stock: 25,   min: 10,  vendor: "Embroidery Masters",       contact: "+92-300-9998887", rack: "B1",  desc: "Multi-head embroidered organza pieces.", notes: "Premium quality, high demand." },
      { idx: 9,  name: "Multi-head Border",         sku: "MH-BORDER-009",    cat: "MULTI_HEAD",   unit: "Yard", price: 800,  stock: 35,   min: 15,  vendor: "Embroidery Masters",       contact: "+92-300-9998887", rack: "B2",  desc: "Pre-embroidered border strips.", notes: "Versatile, used across multiple designs." },
      { idx: 10, name: "Multi-head Ghera Border",   sku: "MH-GHERA-010",     cat: "MULTI_HEAD",   unit: "Yard", price: 900,  stock: 20,   min: 10,  vendor: "Embroidery Masters",       contact: "+92-300-9998887", rack: "B3",  desc: "Wide embroidered ghera (hem) border.", notes: "Essential for formal wear hems." },
      { idx: 11, name: "Multi-head Neckline",       sku: "MH-NECK-011",      cat: "MULTI_HEAD",   unit: "Piece",price: 1500, stock: 18,   min: 8,   vendor: "Embroidery Masters",       contact: "+92-300-9998887", rack: "B4",  desc: "Pre-embroidered neckline pieces.", notes: "High-value piece, handle with care." },
      { idx: 12, name: "Multi-head Sleeve",         sku: "MH-SLEEVE-012",    cat: "MULTI_HEAD",   unit: "Pair", price: 700,  stock: 22,   min: 10,  vendor: "Embroidery Masters",       contact: "+92-300-9998887", rack: "B5",  desc: "Pre-embroidered sleeve panels.", notes: "Sold in pairs. Popular for formal wear." },
      { idx: 13, name: "M.H Champagne Karti",       sku: "MH-CHAMPKARTI-013",cat: "MULTI_HEAD",   unit: "Gram", price: 8,    stock: 850,  min: 400, vendor: "ADA Materials Bazaar",     contact: "+92-321-1112223", rack: "B6",  desc: "Champagne colored karti work from multi-head machine.", notes: "Bulk item, measured by weight." },

      // ── ADDA_MATERIAL (22 items) ──────────────────────────────────────
      { idx: 14, name: "Kulfi",                sku: "ADA-KULFI-014",       cat: "ADDA_MATERIAL", unit: "Gram", price: 12,   stock: 650,  min: 300, vendor: "ADA Materials Bazaar",     contact: "+92-321-1112223", rack: "C1",  desc: "Kulfi shaped embellishments for hand-applied decoration.", notes: "Essential for signature designs." },
      { idx: 15, name: "Champagne Badaam",     sku: "ADA-CHAMPBAD-015",    cat: "ADDA_MATERIAL", unit: "Gram", price: 14,   stock: 520,  min: 250, vendor: "ADA Materials Bazaar",     contact: "+92-321-1112223", rack: "C2",  desc: "Almond-shaped champagne embellishments.", notes: "Elegant accent piece." },
      { idx: 16, name: "Behti",                sku: "ADA-BEHTI-016",       cat: "ADDA_MATERIAL", unit: "Gram", price: 10,   stock: 890,  min: 500, vendor: "ADA Materials Bazaar",     contact: "+92-321-1112223", rack: "C3",  desc: "Flowing chain-style embellishments.", notes: "High consumption. Restock frequently." },
      { idx: 17, name: "Bajra Moti",           sku: "ADA-BAJRAMOTI-017",   cat: "ADDA_MATERIAL", unit: "Gram", price: 8,    stock: 480,  min: 500, vendor: "Pearl House",             contact: "+92-333-4445556", rack: "C4",  desc: "Small pearl beads (moti) for hand embellishment.", notes: "BELOW THRESHOLD. Order immediately." },
      { idx: 18, name: "Betkhi Moti",          sku: "ADA-BETKHIMOTI-018",  cat: "ADDA_MATERIAL", unit: "Gram", price: 16,   stock: 720,  min: 400, vendor: "Pearl House",             contact: "+92-333-4445556", rack: "C6",  desc: "Premium pearl beads, higher quality than standard.", notes: "Good stock level." },
      { idx: 19, name: "Champagne Drop Crystal",sku: "ADA-DROPCRYS-019",   cat: "ADDA_MATERIAL", unit: "Gram", price: 25,   stock: 340,  min: 200, vendor: "Crystal Imports",          contact: "+92-345-6667778", rack: "C7",  desc: "Teardrop shaped crystal embellishments.", notes: "Premium, expensive but stunning." },
      { idx: 20, name: "Champagne Crystal 4no",sku: "ADA-CRYS4-020",       cat: "ADDA_MATERIAL", unit: "Gram", price: 22,   stock: 580,  min: 300, vendor: "Crystal Imports",          contact: "+92-345-6667778", rack: "C8",  desc: "Size 4 champagne colored crystals.", notes: "Standard size for most designs." },
      { idx: 21, name: "Golden Sitara 3no",    sku: "ADA-GOLDSTAR3-021",   cat: "ADDA_MATERIAL", unit: "Gram", price: 6,    stock: 1150, min: 600, vendor: "Sequin Suppliers",         contact: "+92-300-7778889", rack: "C9",  desc: "Size 3 golden star-shaped sequins.", notes: "Most common sitara size." },
      { idx: 22, name: "Golden Sitara 6no",    sku: "ADA-GOLDSTAR6-022",   cat: "ADDA_MATERIAL", unit: "Gram", price: 7,    stock: 980,  min: 500, vendor: "Sequin Suppliers",         contact: "+92-300-7778889", rack: "C10", desc: "Size 6 golden star-shaped sequins.", notes: "Larger size, bolder impact." },
      { idx: 23, name: "Antique Sitara",       sku: "ADA-ANTSTAR-023",     cat: "ADDA_MATERIAL", unit: "Gram", price: 9,    stock: 410,  min: 200, vendor: "Sequin Suppliers",         contact: "+92-300-7778889", rack: "C11", desc: "Antique-finish star sequins.", notes: "Vintage look, trending." },
      { idx: 24, name: "Antique Sitara Phool", sku: "ADA-ANTPHOOL-024",    cat: "ADDA_MATERIAL", unit: "Gram", price: 11,   stock: 380,  min: 200, vendor: "Sequin Suppliers",         contact: "+92-300-7778889", rack: "C12", desc: "Flower-shaped antique sequins.", notes: "Unique shape, premium item." },
      { idx: 25, name: "Kerki",                sku: "ADA-KERKI-025",       cat: "ADDA_MATERIAL", unit: "Gram", price: 5,    stock: 1350, min: 700, vendor: "ADA Materials Bazaar",     contact: "+92-321-1112223", rack: "C13", desc: "Small hook-style clasps for attaching embellishments.", notes: "High consumption, keep well-stocked." },
      { idx: 26, name: "Nakshi",               sku: "ADA-NAKSHI-026",      cat: "ADDA_MATERIAL", unit: "Gram", price: 15,   stock: 290,  min: 150, vendor: "ADA Materials Bazaar",     contact: "+92-321-1112223", rack: "C14", desc: "Nakshi work metal pieces for detailed embroidery.", notes: "Specialized item, limited suppliers." },
      { idx: 27, name: "Champagne Kerki",      sku: "ADA-CHAMPKERKI-027",  cat: "ADDA_MATERIAL", unit: "Gram", price: 6,    stock: 1100, min: 600, vendor: "ADA Materials Bazaar",     contact: "+92-321-1112223", rack: "C15", desc: "Champagne colored kerki clasps.", notes: "Matches champagne-themed designs." },
      { idx: 28, name: "Moti Mala",            sku: "ADA-MOTIMALA-028",    cat: "ADDA_MATERIAL", unit: "Gram", price: 18,   stock: 430,  min: 250, vendor: "Pearl House",             contact: "+92-333-4445556", rack: "C16", desc: "Pearl string (mala) for draping and edge work.", notes: "Elegant finishing material." },
      { idx: 29, name: "Pipe",                 sku: "ADA-PIPE-029",        cat: "ADDA_MATERIAL", unit: "Gram", price: 4,    stock: 2100, min: 1000,vendor: "ADA Materials Bazaar",     contact: "+92-321-1112223", rack: "C17", desc: "Thin pipe beads for linear embellishment.", notes: "Very economical, high volume." },
      { idx: 30, name: "Dabka",                sku: "ADA-DABKA-030",       cat: "ADDA_MATERIAL", unit: "Gram", price: 20,   stock: 560,  min: 300, vendor: "ADA Materials Bazaar",     contact: "+92-321-1112223", rack: "C18", desc: "Coiled metallic wire for traditional embroidery.", notes: "Core embroidery material." },
      { idx: 31, name: "Kora",                 sku: "ADA-KORA-031",        cat: "ADDA_MATERIAL", unit: "Gram", price: 18,   stock: 490,  min: 250, vendor: "ADA Materials Bazaar",     contact: "+92-321-1112223", rack: "C19", desc: "Unpolished metallic thread work material.", notes: "Matte finish, traditional look." },
      { idx: 32, name: "Gota",                 sku: "ADA-GOTA-032",        cat: "ADDA_MATERIAL", unit: "Gram", price: 14,   stock: 670,  min: 350, vendor: "ADA Materials Bazaar",     contact: "+92-321-1112223", rack: "C20", desc: "Flat metallic ribbon for gota patti work.", notes: "Very popular for festive wear." },
      { idx: 33, name: "Tilla",                sku: "ADA-TILLA-033",       cat: "ADDA_MATERIAL", unit: "Gram", price: 22,   stock: 310,  min: 150, vendor: "ADA Materials Bazaar",     contact: "+92-321-1112223", rack: "C21", desc: "Gold/silver metallic thread for detailed embroidery.", notes: "Premium material, stunning results." },
      { idx: 34, name: "Resham Thread",        sku: "ADA-RESHAM-034",      cat: "ADDA_MATERIAL", unit: "Gram", price: 8,    stock: 1450, min: 800, vendor: "Thread House",            contact: "+92-300-2223334", rack: "C22", desc: "Silk embroidery thread in various colors.", notes: "Base material for most embroidery." },
      { idx: 35, name: "Sika",                 sku: "ADA-SIKA-035",        cat: "ADDA_MATERIAL", unit: "Gram", price: 6.5,  stock: 720,  min: 400, vendor: "ADA Materials Bazaar",     contact: "+92-321-1112223", rack: "C23", desc: "Small decorative element for detailed work.", notes: "Traditional element." },

      // ── RAW_MATERIAL (7 items) ────────────────────────────────────────
      { idx: 36, name: "Lace - Golden",            sku: "RAW-LACE-036",       cat: "RAW_MATERIAL", unit: "Yard", price: 45,   stock: 120,  min: 50,  vendor: "Trim & Lace Co",          contact: "+92-333-9990001", rack: "D1",  desc: "Golden decorative lace for edging.", notes: "Essential for finishing work." },
      { idx: 37, name: "Lace - Silver",            sku: "RAW-LACESILV-037",   cat: "RAW_MATERIAL", unit: "Yard", price: 45,   stock: 95,   min: 50,  vendor: "Trim & Lace Co",          contact: "+92-333-9990001", rack: "D2",  desc: "Silver decorative lace.", notes: "Good for silver-themed designs." },
      { idx: 38, name: "Badam Lace",               sku: "RAW-BADAMLACE-038",  cat: "RAW_MATERIAL", unit: "Yard", price: 52,   stock: 78,   min: 40,  vendor: "Trim & Lace Co",          contact: "+92-333-9990001", rack: "D3",  desc: "Almond pattern lace trim.", notes: "Premium option." },
      { idx: 39, name: "Tensel Organza",           sku: "RAW-TENSEL-039",     cat: "RAW_MATERIAL", unit: "Yard", price: 180,  stock: 42,   min: 20,  vendor: "Fabric World",            contact: "+92-345-7778889", rack: "D4",  desc: "Organza for layering and structure.", notes: "Used for inner structure." },
      { idx: 40, name: "Durka",                    sku: "RAW-DURKA-040",      cat: "RAW_MATERIAL", unit: "Gram", price: 4,    stock: 1500, min: 800, vendor: "Trim & Lace Co",          contact: "+92-333-9990001", rack: "D5",  desc: "Durka trim for decorative edging.", notes: "Measured by weight, economical." },
      { idx: 41, name: "Champagne Betkhi Durka",   sku: "RAW-CHAMPDURKA-041", cat: "RAW_MATERIAL", unit: "Gram", price: 5,    stock: 1180, min: 600, vendor: "Trim & Lace Co",          contact: "+92-333-9990001", rack: "D6",  desc: "Champagne colored betkhi style durka.", notes: "Matches champagne theme items." },
      { idx: 42, name: "Pearl Durka",              sku: "RAW-PEARLDURKA-042", cat: "RAW_MATERIAL", unit: "Gram", price: 6,    stock: 890,  min: 500, vendor: "Trim & Lace Co",          contact: "+92-333-9990001", rack: "D7",  desc: "Pearl-style durka trim.", notes: "Elegant finish for bridal wear." },

      // ── READY_STOCK (4 items — variants added separately) ─────────────
      { idx: 43, name: "GOLDESS Luxury Ensemble",       sku: "RS-GOLDESS-043",  cat: "READY_STOCK",  unit: "Piece", price: 35000, stock: 0, min: 0, vendor: "Internal Production", contact: "N/A", rack: "E1", desc: "Complete GOLDESS ensemble, three-piece set.", notes: "Available in M and L only.", hasVariants: true },
      { idx: 44, name: "MAUVE MAGIC Designer Dress",    sku: "RS-MAUVE-044",    cat: "READY_STOCK",  unit: "Piece", price: 32000, stock: 0, min: 0, vendor: "Internal Production", contact: "N/A", rack: "E2", desc: "Complete MAUVE MAGIC outfit.", notes: "Good stock across sizes except M.", hasVariants: true },
      { idx: 45, name: "IVORY MUSE Bridal Collection",  sku: "RS-IVORY-045",    cat: "READY_STOCK",  unit: "Piece", price: 45000, stock: 0, min: 0, vendor: "Internal Production", contact: "N/A", rack: "E3", desc: "IVORY MUSE bridal ensemble.", notes: "Only one left in S. Need urgent production.", hasVariants: true },
      { idx: 46, name: "PRINCESS SOLARA Kaftan",        sku: "RS-SOLARA-046",   cat: "READY_STOCK",  unit: "Piece", price: 28000, stock: 0, min: 0, vendor: "Internal Production", contact: "N/A", rack: "E4", desc: "Elegant PRINCESS SOLARA kaftan.", notes: "Good stock across all sizes.", hasVariants: true },

      // ── READY_SAMPLE (2 items — variants added separately) ────────────
      { idx: 47, name: "AQUA PRINCESS Peshwas Sample",  sku: "SAMP-AQUA-047",   cat: "READY_SAMPLE", unit: "Piece", price: 0,     stock: 0, min: 0, vendor: "Internal Production", contact: "N/A", rack: "F1", desc: "Display sample of AQUA PRINCESS peshwas.", notes: "DISPLAY ONLY.", hasVariants: true },
      { idx: 48, name: "CORAL ELEGANCE Sample",         sku: "SAMP-CORAL-048",  cat: "READY_SAMPLE", unit: "Piece", price: 0,     stock: 0, min: 0, vendor: "Internal Production", contact: "N/A", rack: "F2", desc: "Display sample of CORAL ELEGANCE.", notes: "DISPLAY ONLY.", hasVariants: true },
    ];

    const itemRows = items.map((i) => ({
      id: makeUUID("inv", i.idx),
      name: i.name,
      sku: i.sku,
      category: i.cat,
      description: i.desc,
      unit: i.unit,
      remaining_stock: i.stock,
      min_stock_level: i.min,
      unit_price: i.price,
      vendor_name: i.vendor,
      vendor_contact: i.contact,
      rack_location: i.rack,
      image_url: null,
      linked_product_id: null,
      has_variants: !!i.hasVariants,
      notes: i.notes,
      is_active: true,
      created_at: now,
      updated_at: now,
    }));

    await queryInterface.bulkInsert("inventory_items", itemRows);

    // ====================================================================
    // VARIANTS (for READY_STOCK + READY_SAMPLE)
    // ====================================================================

    const variantDefs = [
      // GOLDESS (idx 43) — S:0, M:2, L:1, XL:0
      { parentIdx: 43, size: "S",  sku: "RS-GOLDESS-S",  stock: 0, reorder: 1, price: 35000 },
      { parentIdx: 43, size: "M",  sku: "RS-GOLDESS-M",  stock: 2, reorder: 1, price: 35000 },
      { parentIdx: 43, size: "L",  sku: "RS-GOLDESS-L",  stock: 1, reorder: 1, price: 35000 },
      { parentIdx: 43, size: "XL", sku: "RS-GOLDESS-XL", stock: 0, reorder: 1, price: 35000 },

      // MAUVE MAGIC (idx 44) — S:1, M:0, L:2, XL:1
      { parentIdx: 44, size: "S",  sku: "RS-MAUVE-S",  stock: 1, reorder: 1, price: 32000 },
      { parentIdx: 44, size: "M",  sku: "RS-MAUVE-M",  stock: 0, reorder: 1, price: 32000 },
      { parentIdx: 44, size: "L",  sku: "RS-MAUVE-L",  stock: 2, reorder: 1, price: 32000 },
      { parentIdx: 44, size: "XL", sku: "RS-MAUVE-XL", stock: 1, reorder: 1, price: 32000 },

      // IVORY MUSE (idx 45) — S:1, M:0, L:0, XL:0
      { parentIdx: 45, size: "S",  sku: "RS-IVORY-S",  stock: 1, reorder: 1, price: 45000 },
      { parentIdx: 45, size: "M",  sku: "RS-IVORY-M",  stock: 0, reorder: 1, price: 45000 },
      { parentIdx: 45, size: "L",  sku: "RS-IVORY-L",  stock: 0, reorder: 1, price: 45000 },
      { parentIdx: 45, size: "XL", sku: "RS-IVORY-XL", stock: 0, reorder: 1, price: 45000 },

      // PRINCESS SOLARA (idx 46) — S:2, M:1, L:2, XL:1
      { parentIdx: 46, size: "S",  sku: "RS-SOLARA-S",  stock: 2, reorder: 1, price: 28000 },
      { parentIdx: 46, size: "M",  sku: "RS-SOLARA-M",  stock: 1, reorder: 1, price: 28000 },
      { parentIdx: 46, size: "L",  sku: "RS-SOLARA-L",  stock: 2, reorder: 1, price: 28000 },
      { parentIdx: 46, size: "XL", sku: "RS-SOLARA-XL", stock: 1, reorder: 1, price: 28000 },

      // AQUA PRINCESS Sample (idx 47) — M:1
      { parentIdx: 47, size: "M",  sku: "SAMP-AQUA-M",  stock: 1, reorder: 1, price: 0 },

      // CORAL ELEGANCE Sample (idx 48) — M:1
      { parentIdx: 48, size: "M",  sku: "SAMP-CORAL-M",  stock: 1, reorder: 1, price: 0 },
    ];

    let variantCounter = 1;
    const variantRows = variantDefs.map((v) => ({
      id: makeUUID("inv-var", variantCounter++),
      inventory_item_id: makeUUID("inv", v.parentIdx),
      size: v.size,
      sku: v.sku,
      remaining_stock: v.stock,
      reorder_level: v.reorder,
      reorder_amount: 5,
      price: v.price,
      image_url: null,
      is_active: true,
      created_at: now,
      updated_at: now,
    }));

    await queryInterface.bulkInsert("inventory_item_variants", variantRows);

    // ====================================================================
    // STOCK MOVEMENTS (audit trail samples)
    // ====================================================================

    const movements = [
      {
        idx: 1, itemIdx: 1, type: "STOCK_IN", qty: 50, after: 45,
        refType: "PURCHASE", notes: "Purchase order from Silk House, Invoice #SH-1234",
        performedBy: adminId, date: "2024-03-10T14:30:00Z",
      },
      {
        idx: 2, itemIdx: 13, type: "STOCK_IN", qty: 1000, after: 850,
        refType: "PURCHASE", notes: "Monthly restock from ADA Materials Bazaar, Invoice #ADA-5678",
        performedBy: adminId, date: "2024-03-17T14:00:00Z",
      },
      {
        idx: 3, itemIdx: 17, type: "STOCK_OUT", qty: 120, after: 480,
        refType: "ORDER", notes: "Used in IVORY MUSE production batch, embellishment",
        performedBy: prodHeadId, date: "2024-03-21T18:00:00Z",
      },
      {
        idx: 4, itemIdx: 7, type: "STOCK_OUT", qty: 7, after: 18,
        refType: "ORDER", notes: "Used for GOLDESS shirts, fabric cutting",
        performedBy: prodHeadId, date: "2024-03-23T09:00:00Z",
      },
      {
        idx: 5, itemIdx: 36, type: "STOCK_IN", qty: 80, after: 120,
        refType: "PURCHASE", notes: "Lace restock, Invoice #TLC-9012",
        performedBy: adminId, date: "2024-03-25T11:00:00Z",
      },
      {
        idx: 6, itemIdx: 21, type: "STOCK_OUT", qty: 200, after: 1150,
        refType: "ORDER", notes: "Used for PRINCESS SOLARA batch production",
        performedBy: prodHeadId, date: "2024-03-28T15:00:00Z",
      },
      {
        idx: 7, itemIdx: 4, type: "STOCK_IN", qty: 36, after: 72,
        refType: "PURCHASE", notes: "Monthly cotton silk restock",
        performedBy: adminId, date: "2024-04-01T09:00:00Z",
      },
      {
        idx: 8, itemIdx: 16, type: "STOCK_OUT", qty: 110, after: 890,
        refType: "ORDER", notes: "Behti consumed for MAUVE MAGIC production",
        performedBy: prodHeadId, date: "2024-04-05T16:00:00Z",
      },
    ];

    const movementRows = movements.map((m) => ({
      id: makeUUID("inv-mov", m.idx),
      inventory_item_id: makeUUID("inv", m.itemIdx),
      movement_type: m.type,
      quantity: m.qty,
      remaining_after: m.after,
      reference_type: m.refType,
      reference_id: null,
      variant_id: null,
      notes: m.notes,
      performed_by: m.performedBy,
      transaction_date: m.date,
      created_at: m.date,
      updated_at: m.date,
    }));

    await queryInterface.bulkInsert("inventory_movements", movementRows);

    console.log(`✅ Seeded ${itemRows.length} inventory items, ${variantRows.length} variants, ${movementRows.length} movements`);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete("inventory_movements", null, {});
    await queryInterface.bulkDelete("inventory_item_variants", null, {});
    await queryInterface.bulkDelete("inventory_items", null, {});
  },
};