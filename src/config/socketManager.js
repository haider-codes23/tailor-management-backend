/**
 * Socket.IO Manager — Phase 16C (Real-time Notifications)
 *
 * Manages WebSocket connections authenticated via JWT.
 * Each user joins a personal room (their userId) so we can
 * push notifications to specific users instantly.
 *
 * Usage:
 *   const { initSocket, getIO } = require("./config/socketManager");
 *
 *   // In server.js — attach to HTTP server:
 *   initSocket(httpServer);
 *
 *   // In any service — emit to a user:
 *   getIO().to(userId).emit("notification", data);
 */

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const env = require("./environment");

let io = null;

/**
 * Initialize Socket.IO and attach to the HTTP server.
 * Called once from server.js.
 *
 * @param {http.Server} httpServer
 * @returns {Server} Socket.IO instance
 */
function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: env.frontendUrl,
      credentials: true,
    },
    // Only use WebSocket (skip long-polling for cleaner connections)
    transports: ["websocket", "polling"],
  });

  // ─── Authentication middleware ──────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const payload = jwt.verify(token, env.jwt.accessSecret);
      socket.userId = payload.userId;
      next();
    } catch (err) {
      return next(new Error("Invalid or expired token"));
    }
  });

  // ─── Connection handler ─────────────────────────────────────────
  io.on("connection", (socket) => {
    const userId = socket.userId;

    // Join user's personal room
    socket.join(userId);

    console.log(`🔌 Socket connected: user ${userId} (socket ${socket.id})`);

    socket.on("disconnect", (reason) => {
      console.log(`🔌 Socket disconnected: user ${userId} (${reason})`);
    });
  });

  console.log("🔌 Socket.IO initialized");
  return io;
}

/**
 * Get the Socket.IO instance.
 * Returns null if not initialized yet — callers should handle this gracefully.
 *
 * @returns {Server|null}
 */
function getIO() {
  return io;
}

module.exports = { initSocket, getIO };