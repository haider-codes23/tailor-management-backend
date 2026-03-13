/**
 * Order Validation Schemas
 *
 * Joi schemas for validating order-related request bodies.
 * Mirrors the data shapes from the frontend CreateOrderPage.jsx
 * and ordersHandlers.js MSW handler.
 */

const Joi = require("joi");
const { PAYMENT_STATUS_VALUES, SIZE_TYPE_VALUES } = require("../../constants/order");

// =========================================================================
// Sub-schemas
// =========================================================================

const includedItemSchema = Joi.object({
  piece: Joi.string().trim().required().messages({
    "any.required": "Piece name is required for included items",
  }),
  price: Joi.number().min(0).default(0),
});

const addOnSchema = Joi.object({
  piece: Joi.string().trim().required().messages({
    "any.required": "Piece name is required for add-ons",
  }),
  price: Joi.number().min(0).default(0),
});

const orderItemSchema = Joi.object({
  // Accept both snake_case and camelCase from frontend
  product_id: Joi.string().uuid().optional(),
  productId: Joi.string().uuid().optional(),
  product_name: Joi.string().trim().optional(),
  productName: Joi.string().trim().optional(),
  product_sku: Joi.string().trim().allow(null, "").optional(),
  productSku: Joi.string().trim().allow(null, "").optional(),
  product_image: Joi.string().allow(null, "").optional(),
  productImage: Joi.string().allow(null, "").optional(),
  quantity: Joi.number().integer().min(1).default(1),
  unit_price: Joi.number().min(0).default(0),
  unitPrice: Joi.number().min(0).default(0),
  size_type: Joi.string().valid(...SIZE_TYPE_VALUES, "Standard", "Custom").insensitive().optional(),
  sizeType: Joi.string().valid(...SIZE_TYPE_VALUES, "Standard", "Custom").insensitive().optional(),
  size: Joi.string().trim().allow(null, "").optional(),
  included_items: Joi.array().items(includedItemSchema).optional(),
  includedItems: Joi.array().items(includedItemSchema).optional(),
  selected_add_ons: Joi.array().items(addOnSchema).optional(),
  selectedAddOns: Joi.array().items(addOnSchema).optional(),
  modesty: Joi.boolean().allow(null).optional(),
  notes: Joi.string().allow(null, "").optional(),
  style: Joi.object().optional(),
  color: Joi.object().optional(),
  fabric: Joi.object().optional(),
}).or("product_id", "productId", "product_name", "productName")
  .messages({
    "object.missing": "Each item must have a product_id or product_name",
  });

// =========================================================================
// Create Order (POST /api/orders)
// =========================================================================

const createOrderSchema = Joi.object({
  // Customer info — accept both casings
  customer_name: Joi.string().trim().max(255).optional(),
  customerName: Joi.string().trim().max(255).optional(),
  customer_email: Joi.string().email({ tlds: false }).allow(null, "").optional(),
  customerEmail: Joi.string().email({ tlds: false }).allow(null, "").optional(),
  customer_phone: Joi.string().trim().max(50).allow(null, "").optional(),
  customerPhone: Joi.string().trim().max(50).allow(null, "").optional(),
  destination: Joi.string().trim().max(100).allow(null, "").optional(),
  client_height: Joi.string().trim().max(50).allow(null, "").optional(),
  clientHeight: Joi.string().trim().max(50).allow(null, "").optional(),
  shipping_address: Joi.object().allow(null).optional(),
  address: Joi.alternatives().try(
      Joi.string().allow(null, ""),
      Joi.object()
    ).optional(),

  // People
  consultant_name: Joi.string().max(255).allow(null, "").optional(),
  consultantName: Joi.string().max(255).allow(null, "").optional(),
  consultantId: Joi.string().uuid().allow(null, "").optional(),
  production_in_charge: Joi.string().max(255).allow(null, "").optional(),
  productionInchargeName: Joi.string().max(255).allow(null, "").optional(),
  production_head_id: Joi.string().uuid().allow(null).optional(),
  productionInchargeId: Joi.string().uuid().allow(null, "").optional(),

  // Financials
  currency: Joi.string().max(10).default("PKR"),
  total_amount: Joi.number().min(0).default(0),
  totalAmount: Joi.number().min(0).default(0),
  discount: Joi.number().min(0).default(0),
  extraPayment: Joi.number().min(0).default(0),
  shipping_cost: Joi.number().min(0).default(0),
  shippingCost: Joi.number().min(0).default(0),
  tax: Joi.number().min(0).default(0),
  payment_method: Joi.string().max(50).allow(null, "").optional(),
  paymentMethod: Joi.string().max(50).allow(null, "").optional(),

  // Dates
  fwd_date: Joi.string().allow(null, "").optional(),
  fwdDate: Joi.string().allow(null, "").optional(),
  production_shipping_date: Joi.string().allow(null, "").optional(),
  productionShippingDate: Joi.string().allow(null, "").optional(),

  // Misc
  urgent: Joi.alternatives().try(Joi.boolean(), Joi.string().allow("", null)).optional(),
  notes: Joi.string().allow(null, "").optional(),
  tags: Joi.array().items(Joi.string()).optional(),

  // Force production override
  force_production: Joi.boolean().default(false),
  forceProduction: Joi.boolean().default(false),

  // Items — required
  items: Joi.array().items(orderItemSchema).min(1).required().messages({
    "array.min": "At least one order item is required",
    "any.required": "Order items are required",
  }),
}).or("customer_name", "customerName")
  .messages({
    "object.missing": "Customer name is required",
  });

// =========================================================================
// Update Order (PUT /api/orders/:id)
// =========================================================================

const updateOrderSchema = Joi.object({
  customer_name: Joi.string().trim().max(255).optional(),
  customerName: Joi.string().trim().max(255).optional(),
  customer_email: Joi.string().email({ tlds: false }).allow(null, "").optional(),
  customerEmail: Joi.string().email({ tlds: false }).allow(null, "").optional(),
  customer_phone: Joi.string().trim().max(50).allow(null, "").optional(),
  customerPhone: Joi.string().trim().max(50).allow(null, "").optional(),
  destination: Joi.string().trim().max(100).allow(null, "").optional(),
  client_height: Joi.string().trim().max(50).allow(null, "").optional(),
  clientHeight: Joi.string().trim().max(50).allow(null, "").optional(),
  shipping_address: Joi.object().allow(null).optional(),
  consultant_name: Joi.string().max(255).allow(null, "").optional(),
  consultantName: Joi.string().max(255).allow(null, "").optional(),
  production_in_charge: Joi.string().max(255).allow(null, "").optional(),
  productionInchargeName: Joi.string().max(255).allow(null, "").optional(),
  production_head_id: Joi.string().uuid().allow(null).optional(),
  currency: Joi.string().max(10).optional(),
  total_amount: Joi.number().min(0).optional(),
  totalAmount: Joi.number().min(0).optional(),
  discount: Joi.number().min(0).optional(),
  shipping_cost: Joi.number().min(0).optional(),
  shippingCost: Joi.number().min(0).optional(),
  tax: Joi.number().min(0).optional(),
  payment_status: Joi.string().valid(...PAYMENT_STATUS_VALUES).optional(),
  paymentStatus: Joi.string().valid(...PAYMENT_STATUS_VALUES).optional(),
  payment_method: Joi.string().max(50).allow(null, "").optional(),
  paymentMethod: Joi.string().max(50).allow(null, "").optional(),
  fwd_date: Joi.string().allow(null, "").optional(),
  fwdDate: Joi.string().allow(null, "").optional(),
  production_shipping_date: Joi.string().allow(null, "").optional(),
  productionShippingDate: Joi.string().allow(null, "").optional(),
  urgent: Joi.alternatives().try(Joi.boolean(), Joi.string().allow("", null)).optional(),
  notes: Joi.string().allow(null, "").optional(),
  order_form_link: Joi.string().allow(null, "").optional(),
  tags: Joi.array().items(Joi.string()).optional(),
}).min(1).messages({
  "object.min": "At least one field must be provided for update",
});

// =========================================================================
// Add Note (POST /api/orders/:id/notes)
// =========================================================================

const addNoteSchema = Joi.object({
  note: Joi.string().trim().min(1).required().messages({
    "any.required": "Note text is required",
    "string.empty": "Note text is required",
  }),
});

// =========================================================================
// Add Payment (POST /api/orders/:id/payments)
// =========================================================================

const addPaymentSchema = Joi.object({
  amount: Joi.number().positive().required().messages({
    "any.required": "Payment amount is required",
    "number.positive": "Amount must be positive",
  }),
  method: Joi.string().max(50).allow(null, "").optional(),
  date: Joi.string().allow(null, "").optional(),
  notes: Joi.string().allow(null, "").optional(),
});

// =========================================================================
// Re-export shared validate middleware
// =========================================================================

const { validate } = require("./authValidation");

module.exports = {
  createOrderSchema,
  updateOrderSchema,
  addNoteSchema,
  addPaymentSchema,
  validate,
};