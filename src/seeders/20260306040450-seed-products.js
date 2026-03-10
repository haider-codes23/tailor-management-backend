"use strict";

const crypto = require("crypto");

/**
 * Seeder: Products + Product Size Chart Rows + Product Height Chart Rows
 *
 * Maps mockProducts.js from the frontend into 3 backend tables:
 *   1. products          — core product data
 *   2. product_size_chart_rows   — per-product size measurements
 *   3. product_height_chart_rows — per-product height measurements
 *
 * Notes:
 *  - Frontend `primary_image` → stored in the `images` JSONB array
 *  - Frontend `active` → maps to `is_active`
 *  - Frontend computed fields (subtotal, discount, total_price) are NOT
 *    stored in the DB — the API computes them on the fly from product_items + add_ons
 *  - All 9 products share the same measurement chart template values
 *    (matching mockMeasurementCharts.js defaults)
 *  - UUIDs are deterministic (derived from product SKU) so that other
 *    seeders (BOMs, orders) can reference them by known ID
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // =========================================================================
    // Helper: deterministic UUID from a string (so BOMs/orders can FK to these)
    // =========================================================================
    function deterministicUUID(input) {
      const hash = crypto.createHash("sha256").update(input).digest("hex");
      // Format as UUID v4 shape: 8-4-4-4-12
      return [
        hash.substring(0, 8),
        hash.substring(8, 12),
        "4" + hash.substring(13, 16), // version nibble = 4
        "a" + hash.substring(17, 20), // variant nibble
        hash.substring(20, 32),
      ].join("-");
    }

    // =========================================================================
    // 1. Define all 9 products (mirrors mockProducts.js exactly)
    // =========================================================================
    const products = [
      {
        sku: "AP-001",
        name: "Aqua Princess",
        description:
          "Aqua Princess is a vision of regal elegance, blending soft aqua tones with intricate handwork. Featuring a luxurious peshwas silhouette adorned with tissue fabric, multi-head embroidery, and ADA-material embellishments, this piece captures timeless femininity.",
        category: "Formal",
        primary_image:
          "https://musferahsaad.net/cdn/shop/files/1_4dc89fe7-40ee-4a96-8638-f3f5d6ae29e4.jpg?v=1746994088&width=1080",
        product_items: [{ piece: "peshwas", price: 120000 }],
        add_ons: [
          { piece: "dupatta", price: 20000 },
          { piece: "pouch", price: 12000 },
        ],
        created_at: "2024-01-15T10:00:00Z",
        updated_at: "2024-04-20T12:00:00Z",
      },
      {
        sku: "RE-002",
        name: "Royal Ember",
        description:
          "Royal Ember is a fiery statement of opulence. This ensemble combines rich maroon tones with elaborate gold zardozi and resham threadwork, creating a look that radiates power and elegance.",
        category: "Formal",
        primary_image:
          "https://musferahsaad.net/cdn/shop/files/2_cbc7ba7c-2f5c-43c3-9d42-cd67d200f8a6.jpg?v=1746994127&width=1080",
        product_items: [
          { piece: "shirt", price: 80000 },
          { piece: "lehnga", price: 60000 },
        ],
        add_ons: [
          { piece: "dupatta", price: 20000 },
          { piece: "pouch", price: 12000 },
        ],
        created_at: "2024-01-20T11:00:00Z",
        updated_at: "2024-04-21T13:00:00Z",
      },
      {
        sku: "PS-003",
        name: "Princess Solara",
        description:
          "Princess Solara captures the warmth of golden sunlight in couture form. With its kaftan silhouette in tissue silk, enriched with kimkhab fabric and golden sitara embellishments, this design brings celestial warmth to any occasion.",
        category: "Semi-Formal",
        primary_image:
          "https://musferahsaad.net/cdn/shop/files/Princesssolara3.webp?v=1746994089&width=1080",
        product_items: [{ piece: "kaftan", price: 62000 }],
        add_ons: [{ piece: "pouch", price: 10000 }],
        created_at: "2024-02-01T09:00:00Z",
        updated_at: "2024-04-22T10:00:00Z",
      },
      {
        sku: "RS-004",
        name: "Royal Sapphire",
        description:
          "Royal Sapphire exudes deep oceanic majesty. A stunning shirt and sharara set in rich sapphire blue, adorned with signature ADA-material work, tilla embroidery, and delicate pearl accents.",
        category: "Formal",
        primary_image:
          "https://musferahsaad.net/cdn/shop/files/56.png?v=1761888916&width=1080",
        product_items: [
          { piece: "shirt", price: 90000 },
          { piece: "sharara", price: 40000 },
        ],
        add_ons: [
          { piece: "dupatta", price: 25000 },
          { piece: "pouch", price: 12000 },
        ],
        created_at: "2024-02-10T12:00:00Z",
        updated_at: "2024-04-23T13:00:00Z",
      },
      {
        sku: "EV-005",
        name: "Elysian Verde",
        description:
          "Elysian Verde brings the beauty of nature to couture form. In deep green tones with gorgeous gold hand embellishments, the silhouette flows with effortless sophistication.",
        category: "Formal",
        primary_image:
          "https://musferahsaad.net/cdn/shop/files/67.png?v=1761888916&width=1080",
        product_items: [
          { piece: "shirt", price: 100000 },
          { piece: "farshi", price: 50000 },
          { piece: "sharara", price: 30000 },
        ],
        add_ons: [
          { piece: "dupatta", price: 20000 },
          { piece: "shawl", price: 40000 },
          { piece: "pouch", price: 12000 },
        ],
        created_at: "2024-02-15T14:00:00Z",
        updated_at: "2024-04-24T15:00:00Z",
      },
      {
        sku: "DD-006",
        name: "Drape of Divinity",
        description:
          "Drape of Divinity reimagines the saree as an emblem of a goddess. Its flowing form, enriched with artisanal handwork, intricate tilla work and resham embroidery, embodies timeless allure.",
        category: "Formal",
        primary_image:
          "https://musferahsaad.net/cdn/shop/files/10.png?v=1762027513&width=1080",
        product_items: [
          { piece: "saree", price: 100000 },
          { piece: "peti_coat", price: 30000 },
          { piece: "blouse", price: 30000 },
        ],
        add_ons: [{ piece: "pouch", price: 12000 }],
        created_at: "2024-02-20T10:00:00Z",
        updated_at: "2024-04-25T11:00:00Z",
      },
      {
        sku: "CM-007",
        name: "Coral Mirage",
        description:
          "A symphony of coral tones brought to life through exquisite craftsmanship. Coral Mirage captures the poetry of soft structure and fluid grace.",
        category: "Formal",
        primary_image:
          "https://musferahsaad.net/cdn/shop/files/1_4e6a8f2f-bb2e-4d3e-9587-d2c6e8f4d9a2.jpg?v=1746994200&width=1080",
        product_items: [
          { piece: "blouse", price: 40000 },
          { piece: "sharara", price: 50000 },
        ],
        add_ons: [
          { piece: "dupatta", price: 20000 },
          { piece: "pouch", price: 12000 },
        ],
        created_at: "2024-03-01T08:00:00Z",
        updated_at: "2024-04-26T09:00:00Z",
      },
      {
        sku: "MB-008",
        name: "Midnight Bloom",
        description:
          "Midnight Bloom captures the enchantment of a moonlit garden in full blossom. Rich midnight blue fabrics adorned with silver and gold threadwork create a mesmerizing contrast.",
        category: "Formal",
        primary_image:
          "https://musferahsaad.net/cdn/shop/files/78.png?v=1761888916&width=1080",
        product_items: [
          { piece: "shirt", price: 85000 },
          { piece: "lehnga", price: 55000 },
        ],
        add_ons: [
          { piece: "dupatta", price: 22000 },
          { piece: "pouch", price: 12000 },
        ],
        created_at: "2024-03-05T11:00:00Z",
        updated_at: "2024-04-27T12:00:00Z",
      },
      {
        sku: "AE-009",
        name: "Aqua Elegance",
        description:
          "Immerse yourself in the lavish splendor of Aqua Elegance. This magnificent creation showcases a harmonious fusion of architectural elements and gentle floral vines.",
        category: "Semi-Formal",
        primary_image:
          "https://musferahsaad.net/cdn/shop/files/Aqua1.webp?v=1746994128&width=1080",
        product_items: [{ piece: "kaftan", price: 58000 }],
        add_ons: [{ piece: "pouch", price: 12000 }],
        created_at: "2024-03-15T10:00:00Z",
        updated_at: "2024-04-29T11:00:00Z",
      },
    ];

    // =========================================================================
    // 2. Build products rows for bulk insert
    // =========================================================================
    const productRows = products.map((p) => ({
      id: deterministicUUID(`product-${p.sku}`),
      name: p.name,
      sku: p.sku,
      description: p.description,
      category: p.category,
      images: JSON.stringify(p.primary_image ? [p.primary_image] : []),
      product_items: JSON.stringify(p.product_items),
      add_ons: JSON.stringify(p.add_ons),
      shopify_product_id: null,
      shopify_variant_id: null,
      is_active: true,
      // Measurement chart flags (all products have charts initialized)
      has_size_chart: true,
      has_height_chart: true,
      enabled_size_fields: JSON.stringify([
        "shoulder",
        "bust",
        "waist",
        "hip",
        "armhole",
      ]),
      enabled_height_fields: JSON.stringify([
        "kaftan_length",
        "sleeve_front_length",
        "sleeve_back_length",
        "lehnga_length",
      ]),
      created_at: new Date(p.created_at),
      updated_at: new Date(p.updated_at),
    }));

    await queryInterface.bulkInsert("products", productRows);

    // =========================================================================
    // 3. Seed product_size_chart_rows for every product
    //    All products share the same default template (matches mockProducts.js)
    // =========================================================================
    const sizeTemplate = [
      { size_code: "XS", shoulder: 13.5, bust: 32, waist: 25, hip: 35, armhole: 7.5, uk_size: 6, us_size: 2, sequence: 1 },
      { size_code: "S", shoulder: 14, bust: 34, waist: 27, hip: 37, armhole: 8, uk_size: 8, us_size: 4, sequence: 2 },
      { size_code: "M", shoulder: 15, bust: 38, waist: 30, hip: 40, armhole: 8.5, uk_size: 12, us_size: 8, sequence: 3 },
      { size_code: "L", shoulder: 16, bust: 42, waist: 34, hip: 44, armhole: 9, uk_size: 14, us_size: 10, sequence: 4 },
      { size_code: "XL", shoulder: 17, bust: 46, waist: 38, hip: 48, armhole: 9.5, uk_size: 16, us_size: 12, sequence: 5 },
      { size_code: "XXL", shoulder: 18, bust: 50, waist: 42, hip: 52, armhole: 10, uk_size: 18, us_size: 14, sequence: 6 },
    ];

    const sizeChartRows = [];
    for (const p of products) {
      const productId = deterministicUUID(`product-${p.sku}`);
      for (const row of sizeTemplate) {
        sizeChartRows.push({
          product_id: productId,
          size_code: row.size_code,
          shoulder: row.shoulder,
          bust: row.bust,
          waist: row.waist,
          hip: row.hip,
          armhole: row.armhole,
          uk_size: row.uk_size,
          us_size: row.us_size,
          sequence: row.sequence,
          created_at: new Date(p.created_at),
          updated_at: new Date(p.updated_at),
        });
      }
    }

    await queryInterface.bulkInsert("product_size_chart_rows", sizeChartRows);

    // =========================================================================
    // 4. Seed product_height_chart_rows for every product
    // =========================================================================
    const heightTemplate = [
      { height_range: "5'0\" - 5'2\"", height_min_inches: 60, height_max_inches: 62, kaftan_length: 52, sleeve_front_length: 17, sleeve_back_length: 15, lehnga_length: 40, sequence: 1 },
      { height_range: "5'3\" - 5'5\"", height_min_inches: 63, height_max_inches: 65, kaftan_length: 54, sleeve_front_length: 18, sleeve_back_length: 16, lehnga_length: 42, sequence: 2 },
      { height_range: "5'6\" - 5'8\"", height_min_inches: 66, height_max_inches: 68, kaftan_length: 56, sleeve_front_length: 19, sleeve_back_length: 17, lehnga_length: 44, sequence: 3 },
      { height_range: "5'9\" - 5'11\"", height_min_inches: 69, height_max_inches: 71, kaftan_length: 58, sleeve_front_length: 20, sleeve_back_length: 18, lehnga_length: 46, sequence: 4 },
      { height_range: "6'0\" - 6'2\"", height_min_inches: 72, height_max_inches: 74, kaftan_length: 60, sleeve_front_length: 21, sleeve_back_length: 19, lehnga_length: 48, sequence: 5 },
    ];

    const heightChartRows = [];
    for (const p of products) {
      const productId = deterministicUUID(`product-${p.sku}`);
      for (const row of heightTemplate) {
        heightChartRows.push({
          product_id: productId,
          height_range: row.height_range,
          height_min_inches: row.height_min_inches,
          height_max_inches: row.height_max_inches,
          kaftan_length: row.kaftan_length,
          sleeve_front_length: row.sleeve_front_length,
          sleeve_back_length: row.sleeve_back_length,
          lehnga_length: row.lehnga_length,
          sequence: row.sequence,
          created_at: new Date(p.created_at),
          updated_at: new Date(p.updated_at),
        });
      }
    }

    await queryInterface.bulkInsert("product_height_chart_rows", heightChartRows);

    console.log(`✅ Seeded ${products.length} products`);
    console.log(`✅ Seeded ${sizeChartRows.length} size chart rows (${products.length} × 6)`);
    console.log(`✅ Seeded ${heightChartRows.length} height chart rows (${products.length} × 5)`);
  },

  async down(queryInterface) {
    // Delete in reverse dependency order
    await queryInterface.bulkDelete("product_height_chart_rows", null, {});
    await queryInterface.bulkDelete("product_size_chart_rows", null, {});
    await queryInterface.bulkDelete("products", null, {});
  },
};