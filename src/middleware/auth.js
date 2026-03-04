/**
 * Auth Middleware
 *
 * Two middleware functions:
 * 1. authenticate — verifies JWT access token, attaches req.user
 * 2. requirePermission — checks user has required permissions
 */

const jwt = require("jsonwebtoken");
const env = require("../config/environment");
const { User } = require("../models");

/**
 * Authenticate middleware
 *
 * Extracts the JWT from the Authorization header (Bearer <token>),
 * verifies it, looks up the user in DB, and attaches the safe user
 * object to `req.user`.
 *
 * Returns 401 if token is missing, invalid, expired, or user not found.
 */
async function authenticate(req, res, next) {
    try {
        // Extract token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                error: "UNAUTHORIZED",
                message: "No valid access token provided",
            });
        }

        const token = authHeader.split(" ")[1];

        // Verify the token
        let payload;
        try {
            payload = jwt.verify(token, env.jwt.accessSecret);
        } catch (err) {
            if (err.name === "TokenExpiredError") {
                return res.status(401).json({
                    error: "TOKEN_EXPIRED",
                    message: "Access token has expired",
                });
            }

            return res.status(401).json({
                error: "INVALID_TOKEN",
                message: "Invalid or malformed token",
            });
        }

        // Look up the user in DB
        const user = await User.findByPk(payload.userId);

        if (!user || !user.is_active) {
            return res.status(401).json({
                error: "UNAUTHORIZED",
                message: "User not found or account deactivated",
            });
        }

        // Attach safe user data to request
        req.user = user.toSafeJSON();
        next();
    } catch (error) {
        console.error("Auth middleware error:", error);
        return res.status(500).json({
            error: "INTERNAL_ERROR",
            message: "Authentication check failed",
        });
    }
}

/**
 * Permission middleware factory
 *
 * Returns middleware that checks if the authenticated user has
 * ANY of the required permissions.
 *
 * Usage:
 *   router.get('/orders', authenticate, requirePermission('orders.view'), controller)
 *   router.post('/orders', authenticate, requirePermission('orders.create'), controller)
 *
 * @param {...string} permissions - One or more permission strings
 * @returns {Function} Express middleware
 */
function requirePermission(...permissions) {
    return (req, res, next) => {
        // authenticate middleware must run first
        if (!req.user) {
            return res.status(401).json({
                error: "UNAUTHORIZED",
                message: "Authentication required",
            });
        }

        const userPermissions = req.user.permissions || [];

        // Check if user has ANY of the required permissions
        const hasPermission = permissions.some((perm) =>
            userPermissions.includes(perm)
        );

        if (!hasPermission) {
            return res.status(403).json({
                error: "FORBIDDEN",
                message: "You do not have permission to perform this action",
                required: permissions,
            });
        }

        next();
    };
}

module.exports = { authenticate, requirePermission };
