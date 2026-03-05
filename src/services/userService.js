/**
 * User Service
 *
 * Business logic for user management — separated from HTTP concerns.
 * Mirrors the logic from the frontend MSW usersHandlers.js.
 *
 * Handles: list (with filters), get by ID, create, update, soft delete,
 * and role permission templates.
 */

const { Op: Operators } = require("sequelize");
const { User } = require("../models");
const { ROLE_TEMPLATES } = require("../constants/roleTemplate");

// =========================================================================
// Service Methods
// =========================================================================

/**
 * List all users with optional filters.
 *
 * @param {Object} filters - { role, is_active, search }
 * @returns {Promise<{ users: Array, total: number, filters_applied: Object }>}
 */
async function listUsers({ role, is_active, search } = {}) {
    const where = {};

    // Filter by role
    if (role) {
        where.role = role;
    }

    // Filter by active status
    if (is_active !== undefined && is_active !== null) {
        where.is_active = is_active === "true" || is_active === true;
    }

    // Filter by search (name or email, case-insensitive)
    if (search) {
        where[Operators.or] = [
            { name: { [Operators.iLike]: `%${search}%` } },
            { email: { [Operators.iLike]: `%${search}%` } },
        ];
    }

    const users = await User.findAll({
        where,
        order: [["created_at", "DESC"]],
        attributes: { exclude: ["password_hash", "refresh_token_hash"] },
    });

    return {
        users,
        total: users.length,
        filters_applied: { role: role || null, is_active: is_active ?? null, search: search || null },
    };
}

/**
 * Get a single user by ID.
 *
 * @param {string} userId - UUID
 * @returns {Promise<Object>} Safe user object
 * @throws {Error} If user not found
 */
async function getUserById(userId) {
    const user = await User.findByPk(userId, {
        attributes: { exclude: ["password_hash", "refresh_token_hash"] },
    });

    if (!user) {
        const error = new Error("User not found");
        error.status = 404;
        error.code = "USER_NOT_FOUND";
        throw error;
    }

    return user;
}

/**
 * Create a new user.
 *
 * Password hashing is handled automatically by the User model's
 * beforeCreate hook — we just pass the plain `password` field.
 *
 * @param {Object} data - { name, email, password, role, phone, permissions, is_active }
 * @returns {Promise<Object>} Created user (safe JSON)
 * @throws {Error} If email already exists
 */
async function createUser(data) {
    const { name, email, password, role, phone, permissions, is_active } = data;

    // Check email uniqueness (case-insensitive)
    const existing = await User.findByEmail(email);
    if (existing) {
        const error = new Error("Email already exists");
        error.status = 409;
        error.code = "EMAIL_EXISTS";
        throw error;
    }

    // Create user — password hashing happens in model beforeCreate hook
    const user = await User.create({
        name,
        email: email.toLowerCase(),
        password: password || `${role.toLowerCase()}${Date.now().toString().slice(-6)}`,
        role,
        phone: phone || null,
        permissions: permissions || [],
        is_active: is_active !== undefined ? is_active : true,
    });

    return user.toSafeJSON();
}

/**
 * Update an existing user.
 *
 * If a new password is provided, the User model's beforeUpdate hook
 * will automatically hash it into password_hash.
 *
 * @param {string} userId - UUID
 * @param {Object} updates - Partial user fields
 * @returns {Promise<Object>} Updated user (safe JSON)
 * @throws {Error} If user not found or email conflict
 */
async function updateUser(userId, updates) {
    const user = await User.findByPk(userId);

    if (!user) {
        const error = new Error("User not found");
        error.status = 404;
        error.code = "USER_NOT_FOUND";
        throw error;
    }

    // If email is being changed, check uniqueness
    if (updates.email && updates.email.toLowerCase() !== user.email.toLowerCase()) {
        const existing = await User.findByEmail(updates.email);
        if (existing) {
            const error = new Error("Email already exists");
            error.status = 409;
            error.code = "EMAIL_EXISTS";
            throw error;
        }
        updates.email = updates.email.toLowerCase();
    }

    // Apply updates — password hashing happens in model beforeUpdate hook
    await user.update(updates);

    return user.toSafeJSON();
}

/**
 * Soft-delete (deactivate) a user.
 *
 * @param {string} userId - UUID
 * @returns {Promise<void>}
 * @throws {Error} If user not found
 */
async function deleteUser(userId) {
    const user = await User.findByPk(userId);

    if (!user) {
        const error = new Error("User not found");
        error.status = 404;
        error.code = "USER_NOT_FOUND";
        throw error;
    }

    await user.update({ is_active: false });
}

/**
 * Get role permission templates.
 *
 * Returns predefined permission sets for each role so the frontend
 * can auto-populate the permission selector when a role is chosen.
 *
 * @returns {Object} Role templates keyed by role name
 */
function getRoleTemplates() {
    return ROLE_TEMPLATES;
}

module.exports = {
    listUsers,
    getUserById,
    createUser,
    updateUser,
    deleteUser,
    getRoleTemplates,
};