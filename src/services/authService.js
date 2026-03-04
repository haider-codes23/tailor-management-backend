/**
 * Auth Service
 *
 * Business logic for authentication — separated from HTTP concerns.
 * Handles login, token refresh (with rotation), logout, and user lookup.
 */

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const env = require("../config/environment");
const { User } = require("../models");

// ===========================================================================
// Token Generation
// ===========================================================================

/**
 * Generate a JWT access token
 * @param {Object} user - User instance
 * @returns {string} Signed JWT
 */
function generateAccessToken(user) {
    return jwt.sign(
        { userId: user.id, role: user.role },
        env.jwt.accessSecret,
        { expiresIn: env.jwt.accessExpiry }
    );
}

/**
 * Generate a JWT refresh token
 * @param {Object} user - User instance
 * @returns {string} Signed JWT
 */
function generateRefreshToken(user) {
    return jwt.sign(
        { userId: user.id, type: "refresh" },
        env.jwt.refreshSecret,
        { expiresIn: env.jwt.refreshExpiry }
    );
}

// ===========================================================================
// Auth Operations
// ===========================================================================

/**
 * Authenticate a user with email and password
 *
 * @param {string} email - User's email
 * @param {string} password - Plain-text password
 * @returns {Promise<{user: Object, accessToken: string, refreshToken: string}>}
 * @throws {Error} If credentials are invalid or account is inactive
 */
async function login(email, password) {
    // Find user by email (case-insensitive)
    const user = await User.findByEmail(email);

    if (!user) {
        const error = new Error("Invalid email or password");
        error.status = 401;
        error.code = "INVALID_CREDENTIALS";
        throw error;
    }

    // Check if account is active
    if (!user.is_active) {
        const error = new Error("Account is deactivated. Contact your administrator.");
        error.status = 401;
        error.code = "ACCOUNT_INACTIVE";
        throw error;
    }

    // Validate password
    const isValid = await user.validPassword(password);
    if (!isValid) {
        const error = new Error("Invalid email or password");
        error.status = 401;
        error.code = "INVALID_CREDENTIALS";
        throw error;
    }

    // Generate tokens
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Store hashed refresh token in DB for rotation/revocation
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await user.update({
        refresh_token_hash: refreshTokenHash,
        last_login_at: new Date(),
    });

    return {
        user: user.toSafeJSON(),
        accessToken,
        refreshToken,
    };
}

/**
 * Refresh the access token using a valid refresh token.
 * Implements token rotation — old refresh token is invalidated
 * and a new pair is issued.
 *
 * @param {string} refreshToken - The current refresh token (from cookie)
 * @returns {Promise<{accessToken: string, refreshToken: string}>}
 * @throws {Error} If refresh token is invalid or expired
 */
async function refresh(refreshToken) {
    let payload;

    try {
        payload = jwt.verify(refreshToken, env.jwt.refreshSecret);
    } catch (err) {
        const error = new Error("Invalid or expired refresh token. Please log in again.");
        error.status = 401;
        error.code = "INVALID_REFRESH_TOKEN";
        throw error;
    }

    // Find the user
    const user = await User.findByPk(payload.userId);

    if (!user || !user.is_active) {
        const error = new Error("User not found or account deactivated.");
        error.status = 401;
        error.code = "INVALID_REFRESH_TOKEN";
        throw error;
    }

    // Verify the refresh token matches what's stored in DB (rotation check)
    if (!user.refresh_token_hash) {
        const error = new Error("Refresh token has been revoked. Please log in again.");
        error.status = 401;
        error.code = "INVALID_REFRESH_TOKEN";
        throw error;
    }

    const isValidToken = await bcrypt.compare(refreshToken, user.refresh_token_hash);
    if (!isValidToken) {
        // Token doesn't match — possible token theft. Invalidate all sessions.
        await user.update({ refresh_token_hash: null });

        const error = new Error("Refresh token reuse detected. All sessions invalidated.");
        error.status = 401;
        error.code = "TOKEN_REUSE_DETECTED";
        throw error;
    }

    // Generate new token pair (rotation)
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Store the new hashed refresh token
    const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 10);
    await user.update({ refresh_token_hash: newRefreshTokenHash });

    return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
    };
}

/**
 * Logout — invalidate the refresh token
 *
 * @param {string} userId - The user's ID
 * @returns {Promise<void>}
 */
async function logout(userId) {
    await User.update(
        { refresh_token_hash: null },
        { where: { id: userId } }
    );
}

/**
 * Get a user by ID (for the /me endpoint)
 *
 * @param {string} userId - The user's UUID
 * @returns {Promise<Object|null>} Safe user JSON or null
 */
async function getUserById(userId) {
    const user = await User.findByPk(userId);

    if (!user || !user.is_active) {
        return null;
    }

    return user.toSafeJSON();
}

module.exports = {
    login,
    refresh,
    logout,
    getUserById,
    generateAccessToken,
};
