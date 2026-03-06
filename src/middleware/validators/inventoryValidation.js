/**
 * Inventory Validation Schemas
 *
 * Joi schemas for validating inventory-related request bodies.
 * Mirrors the validation logic from the frontend MSW inventoryHandlers.js.
 */

const Joi = require("joi");
const { INVENTORY_CATEGORIES } = require("../../constants/inventory");

// Use shared constant
const VALID_CATEGORIES = INVENTORY_CATEGORIES;

// =========================================================================
// Variant sub-schema (for READY_STOCK / READY_SAMPLE items)
// =========================================================================

const variantSchema = Joi.object({
  id: Joi.string().uuid().optional(),           // For updates to existing variants
  variant_id: Joi.string().uuid().optional(),    // Alias used by frontend
  size: Joi.string().trim().max(50).required().messages({
    "any.required": "Variant size is required",
    "string.empty": "Variant size is required",
  }),
  sku: Joi.string().trim().max(100).allow(null, "").optional(),
  remaining_stock: Joi.number().min(0).default(0),
  reorder_level: Joi.number().min(0).default(0),
  reorder_amount: Joi.number().min(0).default(0),
  price: Joi.number().min(0).allow(null).optional(),
  image_url: Joi.string().allow(null, "").optional(),
});

// =========================================================================
// Create Inventory Item (POST /api/inventory)
// =========================================================================

const createItemSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).required().messages({
    "string.empty": "Name is required",
    "any.required": "Name is required",
  }),
  sku: Joi.string().trim().min(1).max(100).required().messages({
    "string.empty": "SKU is required",
    "any.required": "SKU is required",
  }),
  category: Joi.string()
    .valid(...VALID_CATEGORIES)
    .required()
    .messages({
      "any.required": "Category is required",
      "any.only": `Category must be one of: ${VALID_CATEGORIES.join(", ")}`,
    }),
  description: Joi.string().allow(null, "").optional(),
  unit: Joi.string().trim().min(1).max(50).required().messages({
    "string.empty": "Unit is required",
    "any.required": "Unit is required",
  }),

  // Stock fields (for simple items)
  remaining_stock: Joi.number().min(0).default(0),
  min_stock_level: Joi.number().min(0).default(0),
  reorder_level: Joi.number().min(0).default(0), // Frontend alias

  // Pricing
  unit_price: Joi.number().min(0).default(0),
  base_price: Joi.number().min(0).optional(), // Frontend alias

  // Vendor info
  vendor_name: Joi.string().max(255).allow(null, "").optional(),
  vendor_contact: Joi.string().max(255).allow(null, "").optional(),

  // Storage & display
  rack_location: Joi.string().max(100).allow(null, "").optional(),
  image_url: Joi.string().allow(null, "").optional(),
  notes: Joi.string().allow(null, "").optional(),

  // Product link (READY_STOCK)
  linked_product_id: Joi.string().uuid().allow(null).optional(),

  // Variants (READY_STOCK / READY_SAMPLE)
  has_variants: Joi.boolean().default(false),
  variants: Joi.when("has_variants", {
    is: true,
    then: Joi.array().items(variantSchema).min(1).required().messages({
      "array.min": "At least one variant is required for variant items",
      "any.required": "Variants are required when has_variants is true",
    }),
    otherwise: Joi.array().items(variantSchema).optional(),
  }),
});

// =========================================================================
// Update Inventory Item (PUT /api/inventory/:id)
// =========================================================================

const updateItemSchema = Joi.object({
  name: Joi.string().trim().min(1).max(255).optional(),
  sku: Joi.string().trim().min(1).max(100).optional(),
  category: Joi.string()
    .valid(...VALID_CATEGORIES)
    .optional(),
  description: Joi.string().allow(null, "").optional(),
  unit: Joi.string().trim().min(1).max(50).optional(),
  remaining_stock: Joi.number().min(0).optional(),
  min_stock_level: Joi.number().min(0).optional(),
  reorder_level: Joi.number().min(0).optional(),
  reorder_amount: Joi.number().min(0).optional(),
  unit_price: Joi.number().min(0).optional(),
  base_price: Joi.number().min(0).optional(),
  vendor_name: Joi.string().max(255).allow(null, "").optional(),
  vendor_contact: Joi.string().max(255).allow(null, "").optional(),
  rack_location: Joi.string().max(100).allow(null, "").optional(),
  image_url: Joi.string().allow(null, "").optional(),
  notes: Joi.string().allow(null, "").optional(),
  linked_product_id: Joi.string().uuid().allow(null).optional(),
  has_variants: Joi.boolean().optional(),
  is_active: Joi.boolean().optional(),
  variants: Joi.array().items(variantSchema).optional(),
})
  .min(1)
  .messages({
    "object.min": "At least one field must be provided for update",
  });

// =========================================================================
// Stock-In (POST /api/inventory/:id/stock-in)
// =========================================================================

const stockInSchema = Joi.object({
  quantity: Joi.number().positive().required().messages({
    "any.required": "Quantity is required",
    "number.positive": "Quantity must be a positive number",
  }),
  variant_id: Joi.string().uuid().allow(null).optional(),
  reference_number: Joi.string().max(100).allow(null, "").optional(),
  notes: Joi.string().allow(null, "").optional(),
});

// =========================================================================
// Stock-Out (POST /api/inventory/:id/stock-out)
// =========================================================================

const stockOutSchema = Joi.object({
  quantity: Joi.number().positive().required().messages({
    "any.required": "Quantity is required",
    "number.positive": "Quantity must be a positive number",
  }),
  variant_id: Joi.string().uuid().allow(null).optional(),
  reference_number: Joi.string().max(100).allow(null, "").optional(),
  notes: Joi.string().allow(null, "").optional(),
});

// =========================================================================
// Re-export the shared validate middleware factory
// =========================================================================

const { validate } = require("./authValidation");

module.exports = {
  createItemSchema,
  updateItemSchema,
  stockInSchema,
  stockOutSchema,
  validate,
  VALID_CATEGORIES,
};