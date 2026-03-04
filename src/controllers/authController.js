/**
 * Auth Controller
 *
 * Thin HTTP layer that delegates to authService.
 * Handles request parsing, cookie management, and response formatting.
 */

const authService = require("../services/authService");
const env = require("../config/environment");

/**
 * Cookie options for the refresh token
 */
function getRefreshCookieOptions() {
    return {
        httpOnly: true,
        secure: env.isProduction,
        sameSite: "Strict",
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    };
}

/**
 * POST /api/auth/login
 *
 * Authenticates user with email/password.
 * Returns access token in body, sets refresh token as httpOnly cookie.
 */
async function login(req, res, next) {
    try {
        const { email, password } = req.body;

        const result = await authService.login(email, password);

        // Set refresh token as httpOnly cookie
        res.cookie("refreshToken", result.refreshToken, getRefreshCookieOptions());

        // Return user + access token in body (matches frontend expectation)
        return res.status(200).json({
            user: result.user,
            accessToken: result.accessToken,
            message: "Login successful",
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({
                error: error.code || "AUTH_ERROR",
                message: error.message,
            });
        }
        next(error);
    }
}

/**
 * POST /api/auth/refresh
 *
 * Refreshes the access token using the refresh token from the cookie.
 * Implements token rotation — new refresh token replaces old one.
 */
async function refresh(req, res, next) {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {
            return res.status(401).json({
                error: "INVALID_REFRESH_TOKEN",
                message: "Please log in again",
            });
        }

        const result = await authService.refresh(refreshToken);

        // Set new refresh token cookie (rotation)
        res.cookie("refreshToken", result.refreshToken, getRefreshCookieOptions());

        return res.status(200).json({
            accessToken: result.accessToken,
            message: "Token refreshed successfully",
        });
    } catch (error) {
        // Clear the cookie on any refresh failure
        res.clearCookie("refreshToken", { path: "/" });

        if (error.status) {
            return res.status(error.status).json({
                error: error.code || "AUTH_ERROR",
                message: error.message,
            });
        }
        next(error);
    }
}

/**
 * POST /api/auth/logout
 *
 * Invalidates the refresh token and clears the cookie.
 * Requires authentication (access token).
 */
async function logout(req, res, next) {
    try {
        await authService.logout(req.user.id);

        // Clear the refresh token cookie
        res.clearCookie("refreshToken", { path: "/" });

        return res.status(200).json({
            message: "Logged out successfully",
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/auth/me
 *
 * Returns the current authenticated user's data.
 * The authenticate middleware already verified the token
 * and attached the user to req.user.
 */
async function me(req, res) {
    return res.status(200).json({
        user: req.user,
    });
}

module.exports = { login, refresh, logout, me };
