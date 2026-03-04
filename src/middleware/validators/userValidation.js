/**
 * User Validation Schemas
 *
 * Joi schemas for validating user management request bodies.
 * Mirrors the validation logic from the frontend MSW usersHandlers.js.
 */

const Joi = require("joi");

// Valid roles — matches frontend's USER_ROLES and the User model
const VALID_ROLES = [
    "ADMIN",
    "SALES",
    "FABRICATION",
    "PRODUCTION_HEAD",
    "PACKET_CREATOR",
    "DYEING",
    "WORKER",
    "QA",
    "PURCHASER",
    "DISPATCH",
    "CUSTOM",
];

// ===========================================================================
// Schemas
// ===========================================================================

/**
 * Schema for creating a new user (POST /api/users)
 *
 * Required: name, email, password, role, permissions
 * Optional: phone, is_active
 */
const createUserSchema = Joi.object({
    name: Joi.string().trim().min(1).max(255).required().messages({
        "string.empty": "Name is required",
        "any.required": "Name is required",
        "string.max": "Name must be at most 255 characters",
    }),
    email: Joi.string().email().trim().lowercase().required().messages({
        "string.email": "Must be a valid email address",
        "any.required": "Email is required",
        "string.empty": "Email is required",
    }),
    password: Joi.string().min(6).max(128).required().messages({
        "any.required": "Password is required",
        "string.empty": "Password is required",
        "string.min": "Password must be at least 6 characters",
    }),
    role: Joi.string()
        .valid(...VALID_ROLES)
        .required()
        .messages({
            "any.required": "Role is required",
            "any.only": `Role must be one of: ${VALID_ROLES.join(", ")}`,
        }),
    phone: Joi.string().trim().max(50).allow(null, "").optional(),
    permissions: Joi.array().items(Joi.string().trim()).required().messages({
        "any.required": "Permissions must be provided",
        "array.base": "Permissions must be an array",
    }),
    is_active: Joi.boolean().optional().default(true),
});

/**
 * Schema for updating a user (PUT /api/users/:id)
 *
 * All fields are optional (partial update).
 * Password is optional here — only included when admin wants to reset it.
 */
const updateUserSchema = Joi.object({
    name: Joi.string().trim().min(1).max(255).optional().messages({
        "string.empty": "Name cannot be empty",
        "string.max": "Name must be at most 255 characters",
    }),
    email: Joi.string().email().trim().lowercase().optional().messages({
        "string.email": "Must be a valid email address",
    }),
    password: Joi.string().min(6).max(128).optional().messages({
        "string.min": "Password must be at least 6 characters",
    }),
    role: Joi.string()
        .valid(...VALID_ROLES)
        .optional()
        .messages({
            "any.only": `Role must be one of: ${VALID_ROLES.join(", ")}`,
        }),
    phone: Joi.string().trim().max(50).allow(null, "").optional(),
    permissions: Joi.array().items(Joi.string().trim()).optional().messages({
        "array.base": "Permissions must be an array",
    }),
    is_active: Joi.boolean().optional(),
})
    .min(1) // At least one field must be provided
    .messages({
        "object.min": "At least one field must be provided for update",
    });

// ===========================================================================
// Re-export the shared validate middleware factory
// ===========================================================================

const { validate } = require("./authValidation");

module.exports = {
    createUserSchema,
    updateUserSchema,
    validate,
    VALID_ROLES,
};