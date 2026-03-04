/**
 * User Routes
 *
 * All routes require authentication.
 * Each route requires the appropriate permission as defined in Phase 4.
 *
 * Middleware chain: authenticate → requirePermission → [validate] → controller
 *
 * GET    /api/users                  users.view    List users (with filters)
 * GET    /api/users/roles/templates  users.view    Get role permission templates
 * GET    /api/users/:id              users.view    Get user detail
 * POST   /api/users                  users.create  Create user
 * PUT    /api/users/:id              users.edit    Update user
 * DELETE /api/users/:id              users.delete  Deactivate user (soft delete)
 */

const { Router } = require("express");
const userController = require("../controllers/userController");
const { authenticate, requirePermission } = require("../middleware/auth");
const {
    createUserSchema,
    updateUserSchema,
    validate,
} = require("../middleware/validators/userValidation");

const router = Router();

// All user routes require authentication
router.use(authenticate);

// ─── Static routes BEFORE parameterised ones ────────────────────────────────

// GET /api/users/roles/templates — role permission templates
router.get(
    "/roles/templates",
    requirePermission("users.view"),
    userController.getRoleTemplates
);

// ─── Collection routes ──────────────────────────────────────────────────────

// GET /api/users — list with filters
router.get(
    "/",
    requirePermission("users.view"),
    userController.listUsers
);

// POST /api/users — create
router.post(
    "/",
    requirePermission("users.create"),
    validate(createUserSchema),
    userController.createUser
);

// ─── Individual resource routes ─────────────────────────────────────────────

// GET /api/users/:id — detail
router.get(
    "/:id",
    requirePermission("users.view"),
    userController.getUser
);

// PUT /api/users/:id — update
router.put(
    "/:id",
    requirePermission("users.edit"),
    validate(updateUserSchema),
    userController.updateUser
);

// DELETE /api/users/:id — soft delete
router.delete(
    "/:id",
    requirePermission("users.delete"),
    userController.deleteUser
);

module.exports = router;