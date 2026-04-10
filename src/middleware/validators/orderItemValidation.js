/**
 * Order Item Validation Schemas
 *
 * Joi schemas for order item endpoints.
 * Accepts camelCase from frontend (matching ordersApi.js).
 */

const Joi = require("joi");
const { validate } = require("./authValidation");

// ─── Update Order Item (PUT /api/order-items/:id) ─────────────────────

const updateOrderItemSchema = Joi.object({
  status: Joi.string().max(50).optional(),
  updatedBy: Joi.string().optional(),
  style: Joi.object().optional(),
  color: Joi.object().optional(),
  fabric: Joi.object().optional(),
  modesty: Joi.boolean().allow(null).optional(),
  notes: Joi.string().allow(null, "").optional(),
  measurements: Joi.object().optional(),
  measurementCategories: Joi.array().items(Joi.string()).optional(),
  measurement_categories: Joi.array().items(Joi.string()).optional(),
  garmentNotes: Joi.object().allow(null).optional(),
  garment_notes: Joi.object().allow(null).optional(),
  sectionStatuses: Joi.object().optional(),
  section_statuses: Joi.object().optional(),
  heightRange: Joi.string().allow(null, "").optional(),
  height_range: Joi.string().allow(null, "").optional(),
  size: Joi.string().allow(null, "").optional(),
  sizeType: Joi.string().valid("standard", "custom", "STANDARD", "CUSTOM").insensitive().optional(),
  size_type: Joi.string().valid("standard", "custom", "STANDARD", "CUSTOM").insensitive().optional(),
  quantity: Joi.number().integer().min(1).optional(),
  unitPrice: Joi.number().min(0).optional(),
  unit_price: Joi.number().min(0).optional(),
}).min(1).messages({
  "object.min": "At least one field must be provided for update",
});

// ─── Add Order Item (POST /api/orders/:orderId/items) ─────────────────

const pieceSchema = Joi.object({
  piece: Joi.string().required(),
  price: Joi.number().min(0).optional(),
}).unknown(true);

const addOrderItemSchema = Joi.object({
  productId: Joi.string().uuid().allow(null).optional(),
  product_id: Joi.string().uuid().allow(null).optional(),
  productName: Joi.string().max(255).required(),
  product_name: Joi.string().max(255).optional(),
  productSku: Joi.string().max(100).allow(null, "").optional(),
  product_sku: Joi.string().max(100).allow(null, "").optional(),
  productImage: Joi.string().allow(null, "").optional(),
  product_image: Joi.string().allow(null, "").optional(),
  sizeType: Joi.string().valid("standard", "custom", "STANDARD", "CUSTOM").insensitive().optional(),
  size_type: Joi.string().valid("standard", "custom", "STANDARD", "CUSTOM").insensitive().optional(),
  size: Joi.string().max(50).allow(null, "").optional(),
  quantity: Joi.number().integer().min(1).default(1),
  unitPrice: Joi.number().min(0).optional(),
  unit_price: Joi.number().min(0).optional(),
  includedItems: Joi.array().items(pieceSchema).optional(),
  included_items: Joi.array().items(pieceSchema).optional(),
  selectedAddOns: Joi.array().items(pieceSchema).optional(),
  selected_add_ons: Joi.array().items(pieceSchema).optional(),
  addedBy: Joi.string().optional(),
}).or("productName", "product_name");

// ─── Generate Form (POST /api/order-items/:id/generate-form) ──────────

const generateFormSchema = Joi.object({
  style: Joi.object().optional(),
  color: Joi.object().optional(),
  fabric: Joi.object().optional(),
  measurements: Joi.object().optional(),
  selectedCategories: Joi.array().items(Joi.string()).optional(),
  measurementCategories: Joi.array().items(Joi.string()).optional(),
  generatedBy: Joi.string().optional(),
  isEditMode: Joi.boolean().optional(),
  garmentNotes: Joi.object().allow(null).optional(),
  // Allow pass-through of any extra form fields
}).unknown(true);

// ─── Approve Form (POST /api/order-items/:id/approve-form) ────────────

const approveFormSchema = Joi.object({
  approvedBy: Joi.string().optional(),
}).unknown(true);

// ─── Timeline Entry (POST /api/order-items/:id/timeline) ──────────────

const timelineEntrySchema = Joi.object({
  action: Joi.string().max(255).required(),
  description: Joi.string().allow(null, "").optional(),
  metadata: Joi.object().allow(null).optional(),
});

module.exports = {
  updateOrderItemSchema,
  addOrderItemSchema,
  generateFormSchema,
  approveFormSchema,
  timelineEntrySchema,
  validate,
};