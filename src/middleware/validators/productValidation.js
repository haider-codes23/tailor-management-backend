/**
 * Product Validation Schemas
 *
 * Joi schemas for request body validation on product, BOM, BOM item,
 * and measurement chart endpoints.
 */

const Joi = require("joi");

// =========================================================================
// Shared validate middleware (same pattern as inventoryValidation.js)
// =========================================================================

function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const messages = error.details.map((d) => d.message);
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: messages.join("; "),
        details: messages,
      });
    }

    req.body = value;
    next();
  };
}

// =========================================================================
// A. Product Schemas
// =========================================================================

const pieceSchema = Joi.object({
  piece: Joi.string().required(),
  price: Joi.number().min(0).required(),
}).unknown(true);

const createProductSchema = Joi.object({
  name: Joi.string().max(255).required(),
  sku: Joi.string().max(100).required(),
  description: Joi.string().allow(null, "").optional(),
  category: Joi.string().max(100).allow(null, "").optional(),
  images: Joi.array().items(Joi.string()).optional().default([]),
  image_url: Joi.string().allow(null, "").optional(),
  product_items: Joi.array().items(pieceSchema).optional().default([]),
  add_ons: Joi.array().items(pieceSchema).optional().default([]),
  shopify_product_id: Joi.string().max(100).allow(null, "").optional(),
  shopify_variant_id: Joi.string().max(100).allow(null, "").optional(),
  is_active: Joi.boolean().optional().default(true),
});

const updateProductSchema = Joi.object({
  name: Joi.string().max(255).optional(),
  sku: Joi.string().max(100).optional(),
  description: Joi.string().allow(null, "").optional(),
  category: Joi.string().max(100).allow(null, "").optional(),
  images: Joi.array().items(Joi.string()).optional(),
  image_url: Joi.string().allow(null, "").optional(),
  product_items: Joi.array().items(pieceSchema).optional(),
  add_ons: Joi.array().items(pieceSchema).optional(),
  shopify_product_id: Joi.string().max(100).allow(null, "").optional(),
  shopify_variant_id: Joi.string().max(100).allow(null, "").optional(),
  is_active: Joi.boolean().optional(),
  // Pricing fields the frontend sends
  subtotal: Joi.number().min(0).optional(),
  discount: Joi.number().min(0).optional(),
  total_price: Joi.number().min(0).optional(),
}).min(1);

// =========================================================================
// B. BOM Schemas
// =========================================================================

const createBOMSchema = Joi.object({
  size: Joi.string().max(50).required(),
  name: Joi.string().max(255).allow(null, "").optional(),
  notes: Joi.string().allow(null, "").optional(),
});

const updateBOMSchema = Joi.object({
  name: Joi.string().max(255).allow(null, "").optional(),
  notes: Joi.string().allow(null, "").optional(),
  is_active: Joi.boolean().optional(),
}).min(1);

// =========================================================================
// C. BOM Item Schemas
// =========================================================================

const addBOMItemSchema = Joi.object({
  inventory_item_id: Joi.alternatives()
    .try(Joi.string().uuid(), Joi.number().integer())
    .required()
    .custom((value) => String(value)),
  piece: Joi.string().max(100).required(),
  quantity_per_unit: Joi.number().positive().required(),
  unit: Joi.string().max(50).allow(null, "").optional(),
  notes: Joi.string().allow(null, "").optional(),
});

const updateBOMItemSchema = Joi.object({
  inventory_item_id: Joi.string().uuid().optional(),
  piece: Joi.string().max(100).optional(),
  quantity_per_unit: Joi.number().positive().optional(),
  unit: Joi.string().max(50).allow(null, "").optional(),
  notes: Joi.string().allow(null, "").optional(),
}).min(1);

// =========================================================================
// D. Measurement Chart Schemas
// =========================================================================

const sizeChartRowSchema = Joi.object({
  size_code: Joi.string().max(10).required(),
  shoulder: Joi.number().min(0).optional(),
  bust: Joi.number().min(0).optional(),
  waist: Joi.number().min(0).optional(),
  hip: Joi.number().min(0).optional(),
  armhole: Joi.number().min(0).optional(),
  uk_size: Joi.number().integer().allow(null).optional(),
  us_size: Joi.number().integer().allow(null).optional(),
  sequence: Joi.number().integer().min(0).optional(),
}).unknown(true);

const updateSizeChartSchema = Joi.object({
  rows: Joi.array().items(sizeChartRowSchema).min(1).required(),
  enabled_fields: Joi.array().items(Joi.string()).optional(),
});

const heightChartRowSchema = Joi.object({
  height_range: Joi.string().max(30).required(),
  height_min_inches: Joi.number().integer().min(0).required(),
  height_max_inches: Joi.number().integer().min(0).required(),
  kaftan_length: Joi.number().min(0).optional(),
  sleeve_front_length: Joi.number().min(0).optional(),
  sleeve_back_length: Joi.number().min(0).optional(),
  lehnga_length: Joi.number().min(0).optional(),
  sequence: Joi.number().integer().min(0).optional(),
}).unknown(true);

const updateHeightChartSchema = Joi.object({
  rows: Joi.array().items(heightChartRowSchema).min(1).required(),
  enabled_fields: Joi.array().items(Joi.string()).optional(),
});

const initializeChartsSchema = Joi.object({
  initialize_size_chart: Joi.boolean().optional().default(false),
  initialize_height_chart: Joi.boolean().optional().default(false),
  enabled_size_fields: Joi.array().items(Joi.string()).optional(),
  enabled_height_fields: Joi.array().items(Joi.string()).optional(),
});

// =========================================================================
// Exports
// =========================================================================

module.exports = {
  validate,
  createProductSchema,
  updateProductSchema,
  createBOMSchema,
  updateBOMSchema,
  addBOMItemSchema,
  updateBOMItemSchema,
  updateSizeChartSchema,
  updateHeightChartSchema,
  initializeChartsSchema,
};