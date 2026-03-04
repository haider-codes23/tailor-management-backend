/**
 * Auth Routes
 *
 * POST /api/auth/login     - Email/password login (public)
 * POST /api/auth/refresh   - Refresh access token via cookie (public)
 * POST /api/auth/logout    - Invalidate refresh token (authenticated)
 * GET  /api/auth/me        - Get current user (authenticated)
 */

const { Router } = require("express");
const authController = require("../controllers/authController");
const { authenticate } = require("../middleware/auth");
const { loginSchema, validate } = require("../middleware/validators/authValidation");

const router = Router();

// Public routes (no authentication required)
router.post("/login", validate(loginSchema), authController.login);
router.post("/refresh", authController.refresh);

// Protected routes (require valid access token)
router.post("/logout", authenticate, authController.logout);
router.get("/me", authenticate, authController.me);

module.exports = router;
