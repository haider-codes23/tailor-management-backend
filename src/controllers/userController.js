/**
 * User Controller
 *
 * Thin HTTP layer that delegates to userService.
 * Handles request parsing and response formatting.
 *
 * Response format matches frontend expectations:
 *   { success: true, data: ..., meta?: ..., message?: ... }
 */

const userService = require("../services/userService");

/**
 * GET /api/users
 *
 * List all users with optional filters.
 * Query params: role, is_active, search
 */
async function listUsers(req, res, next) {
    try {
        const { role, is_active, search } = req.query;

        const result = await userService.listUsers({ role, is_active, search });

        return res.status(200).json({
            success: true,
            data: result.users,
            meta: {
                total: result.total,
                filters_applied: result.filters_applied,
            },
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/users/:id
 *
 * Get a single user by ID.
 */
async function getUser(req, res, next) {
    try {
        const user = await userService.getUserById(req.params.id);

        return res.status(200).json({
            success: true,
            data: user,
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                error: error.message,
            });
        }
        next(error);
    }
}

/**
 * POST /api/users
 *
 * Create a new user.
 * Body validated by createUserSchema middleware.
 */
async function createUser(req, res, next) {
    try {
        const user = await userService.createUser(req.body);

        return res.status(201).json({
            success: true,
            data: user,
            message: "User created successfully",
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                error: error.message,
            });
        }
        next(error);
    }
}

/**
 * PUT /api/users/:id
 *
 * Update an existing user.
 * Body validated by updateUserSchema middleware.
 */
async function updateUser(req, res, next) {
    try {
        const user = await userService.updateUser(req.params.id, req.body);

        return res.status(200).json({
            success: true,
            data: user,
            message: "User updated successfully",
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                error: error.message,
            });
        }
        next(error);
    }
}

/**
 * DELETE /api/users/:id
 *
 * Soft-delete (deactivate) a user.
 */
async function deleteUser(req, res, next) {
    try {
        await userService.deleteUser(req.params.id);

        return res.status(200).json({
            success: true,
            message: "User deactivated successfully",
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                success: false,
                error: error.message,
            });
        }
        next(error);
    }
}

/**
 * GET /api/users/roles/templates
 *
 * Returns predefined permission templates for each role.
 * Used by the frontend PermissionSelector to auto-populate
 * permissions when a role is selected.
 */
async function getRoleTemplates(req, res) {
    const templates = userService.getRoleTemplates();

    return res.status(200).json({
        success: true,
        data: templates,
    });
}

module.exports = {
    listUsers,
    getUser,
    createUser,
    updateUser,
    deleteUser,
    getRoleTemplates,
};