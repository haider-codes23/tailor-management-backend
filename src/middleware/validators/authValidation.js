/**
 * Auth Validation Schemas
 *
 * Joi schemas for validating auth-related request bodies.
 * The validate() function returns Express middleware.
 */

const Joi = require("joi");

// ===========================================================================
// Schemas
// ===========================================================================

const loginSchema = Joi.object({
    email: Joi.string().email().required().messages({
        "string.email": "Must be a valid email address",
        "any.required": "Email is required",
        "string.empty": "Email is required",
    }),
    password: Joi.string().min(1).required().messages({
        "any.required": "Password is required",
        "string.empty": "Password is required",
    }),
});

// ===========================================================================
// Middleware Factory
// ===========================================================================

/**
 * Create validation middleware from a Joi schema
 *
 * @param {Joi.ObjectSchema} schema - The Joi schema to validate against
 * @returns {Function} Express middleware
 */
function validate(schema) {
    return (req, res, next) => {
        const { error } = schema.validate(req.body, {
            abortEarly: false, // Return all errors, not just the first
            stripUnknown: true, // Remove unknown fields
        });

        if (error) {
            const details = error.details.map((detail) => ({
                field: detail.path.join("."),
                message: detail.message,
            }));

            return res.status(400).json({
                error: "VALIDATION_ERROR",
                message: "Validation failed",
                details,
            });
        }

        next();
    };
}

module.exports = {
    loginSchema,
    validate,
};
