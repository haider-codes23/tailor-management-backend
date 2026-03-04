/**
 * User Service
 *
 * Business logic for user management — separated from HTTP concerns.
 * Mirrors the logic from the frontend MSW usersHandlers.js.
 *
 * Handles: list (with filters), get by ID, create, update, soft delete,
 * and role permission templates.
 */

const { Op } = require("sequelize");
const { User } = require("../models");

// =========================================================================
// Role Permission Templates
// =========================================================================

/**
 * Predefined permission sets for each role.
 * Matches frontend's ROLE_TEMPLATES in src/lib/permissions.js.
 *
 * When an admin selects a role during user creation, these permissions
 * are auto-populated as a starting point that can be customized.
 */
const ROLE_TEMPLATES = {
    ADMIN: {
        label: "Administrator (Full Access)",
        permissions: [
            // User Management
            "users.view", "users.create", "users.edit", "users.delete",
            // Inventory
            "inventory.view", "inventory.create", "inventory.edit",
            "inventory.delete", "inventory.stock_in", "inventory.stock_out",
            // Products & BOM
            "products.view", "products.create", "products.edit",
            "products.delete", "products.manage_bom",
            // Measurements
            "measurements.view", "measurements.edit",
            // Orders
            "orders.view", "orders.create", "orders.edit", "orders.delete",
            "orders.manage_customer_forms", "orders.approve_customer_forms",
            // Fabrication
            "fabrication.view", "fabrication.create_bom", "fabrication.edit_bom",
            // Production
            "production.view", "production.manage", "production.assign_tasks",
            "production.approve_packets", "production.assign_head",
            "production.send_to_qa", "production.start_task", "production.complete_task",
            // Procurement
            "procurement.view", "procurement.manage",
            // QA
            "qa.view", "qa.approve", "qa.request_rework",
            "qa.reject", "qa.upload_video", "qa.send_to_sales", "qa.view_sales_requests",
            // Dyeing
            "dyeing.view", "dyeing.accept", "dyeing.start",
            "dyeing.complete", "dyeing.view_all",
            // Dispatch
            "dispatch.view", "dispatch.manage",
            // Sales Approval
            "sales.view_approval_queue", "sales.send_to_client",
            "sales.mark_client_approved", "sales.request_alteration",
            "sales.request_revideo", "sales.cancel_order", "sales.approve_payments",
            // Reports
            "reports.view",
        ],
    },

    SALES: {
        label: "Sales Representative",
        permissions: [
            "orders.view", "orders.create",
            "orders.manage_customer_forms", "orders.approve_customer_forms",
            "inventory.view", "products.view",
            "sales.view_approval_queue", "sales.send_to_client",
            "sales.mark_client_approved", "sales.request_alteration",
            "sales.request_revideo", "sales.cancel_order", "sales.approve_payments",
        ],
    },

    FABRICATION: {
        label: "Fabrication (Bespoke)",
        permissions: [
            "fabrication.view", "fabrication.create_bom", "fabrication.edit_bom",
            "inventory.view", "products.view",
        ],
    },

    PRODUCTION_HEAD: {
        label: "Production Head",
        permissions: [
            "orders.view", "production.view", "production.manage",
            "production.assign_tasks", "production.approve_packets",
            "production.send_to_qa", "inventory.view", "products.view",
        ],
    },

    PACKET_CREATOR: {
        label: "Packet Creator",
        permissions: [
            "orders.view", "production.view", "inventory.view", "products.view",
        ],
    },

    DYEING: {
        label: "Dyeing Department",
        permissions: [
            "dyeing.view", "dyeing.accept", "dyeing.start", "dyeing.complete",
            "orders.view", "inventory.view", "products.view",
        ],
    },

    WORKER: {
        label: "Production Worker",
        permissions: [
            "production.view", "production.start_task", "production.complete_task",
            "orders.view",
        ],
    },

    QA: {
        label: "Quality Assurance",
        permissions: [
            "orders.view", "qa.view", "qa.approve", "qa.request_rework",
            "qa.reject", "qa.upload_video", "qa.send_to_sales",
            "qa.view_sales_requests", "products.view",
        ],
    },

    PURCHASER: {
        label: "Purchaser",
        permissions: [
            "procurement.view", "procurement.manage",
            "inventory.view", "inventory.stock_in", "orders.view",
        ],
    },

    DISPATCH: {
        label: "Dispatch Manager",
        permissions: [
            "orders.view", "dispatch.view", "dispatch.manage",
        ],
    },

    CUSTOM: {
        label: "Custom Role (Select Permissions Manually)",
        permissions: [],
    },
};

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
        where[Op.or] = [
            { name: { [Op.iLike]: `%${search}%` } },
            { email: { [Op.iLike]: `%${search}%` } },
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
 * @param {Object} data - { name, email, password, role, phone, permissions, is_active }
 * @returns {Promise<Object>} Created user (safe JSON)
 * @throws {Error} If email already exists or validation fails
 */
async function createUser(data) {
    const { name, email, password, role, phone, permissions, is_active } = data;

    // Check email uniqueness (case-insensitive)
    const existing = await User.findByEmail(email);
    if (existing) {
        const error = new Error("Email already exists");
        error.status = 400;
        error.code = "EMAIL_EXISTS";
        throw error;
    }

    // Hash the password
    const password_hash = await User.hashPassword(password);

    // Create user
    const user = await User.create({
        name,
        email: email.toLowerCase(),
        password_hash,
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
            error.status = 400;
            error.code = "EMAIL_EXISTS";
            throw error;
        }
        updates.email = updates.email.toLowerCase();
    }

    // If password is being changed, hash it
    if (updates.password) {
        updates.password_hash = await User.hashPassword(updates.password);
        delete updates.password; // Don't store plain password
    }

    // Apply updates
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
    ROLE_TEMPLATES,
};