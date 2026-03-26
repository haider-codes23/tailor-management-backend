/**
 * Express Application Setup
 *
 * This file configures the Express app with all middleware,
 * routes, and error handling. It does NOT start the server —
 * that's done in server.js so we can also use app in tests.
 */

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const env = require("./config/environment");

const app = express();

// ============================================================================
// SECURITY MIDDLEWARE
// ============================================================================

// Helmet: sets various HTTP headers for security
app.use(helmet());

// CORS: allow frontend to talk to backend
app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true, // Required for httpOnly cookies (refresh tokens)
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ── Shopify webhooks (MUST be before express.json() for raw body access) ──
const shopifyWebhookRoutes = require("./routes/shopifyWebhookRoutes");
app.use("/api/webhooks/shopify", shopifyWebhookRoutes);

// ============================================================================
// PARSING MIDDLEWARE
// ============================================================================

// Parse JSON request bodies
app.use(express.json({ limit: "10mb" }));

// Parse URL-encoded bodies (for form submissions)
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Parse cookies (needed for refresh token)
app.use(cookieParser());

// ============================================================================
// UTILITY MIDDLEWARE
// ============================================================================

// Compress responses
app.use(compression());

// HTTP request logging
if (env.isDevelopment) {
  app.use(morgan("dev")); // Colored concise output for dev
} else {
  app.use(morgan("combined")); // Apache-style logs for production
}

// ============================================================================
// HEALTH CHECK ROUTE
// ============================================================================

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "Tailor Management Backend is running",
    timestamp: new Date().toISOString(),
    environment: env.nodeEnv,
  });
});

// ============================================================================
// API ROUTES (will be added in upcoming phases)
// ============================================================================

// Phase 3: Auth routes
const authRoutes = require("./routes/authRoutes");
app.use("/api/auth", authRoutes);

// Phase 4: User management routes
const userRoutes = require("./routes/userRoutes");
app.use("/api/users", userRoutes);

// Phase 5: Inventory management routes
const inventoryRoutes = require("./routes/inventoryRoutes");
app.use("/api/inventory", inventoryRoutes);


// Phase 6: Products, BOM & Measurement Charts
const productRoutes = require("./routes/productRoutes");
const bomRoutes = require("./routes/bomRoutes");
const bomItemRoutes = require("./routes/bomItemRoutes");
app.use("/api/products", productRoutes);
app.use("/api/boms", bomRoutes);
app.use("/api/bom-items", bomItemRoutes);

// ── Phase 8: Orders
const orderRoutes = require("./routes/orderRoutes");
app.use("/api/orders", orderRoutes);


// ── Phase 8D: Order Items ────────────────────────────────────────────
const orderItemRoutes = require("./routes/orderItemRoutes");
app.use("/api/order-items", orderItemRoutes);

const fabricationRoutes = require("./routes/fabricationRoutes");
app.use("/api/fabrication", fabricationRoutes);

const shopifyAuthRoutes = require("./routes/shopifyAuthRoutes");
app.use("/api/shopify/auth", shopifyAuthRoutes);

const shopifyRoutes = require("./routes/shopifyRoutes");
app.use("/api/shopify", shopifyRoutes);

const procurementRoutes = require("./routes/procurementRoutes");
app.use("/api/procurement-demands", procurementRoutes);


// Phase 7: app.use("/api/measurement-charts", measurementRoutes);
// Phase 8: app.use("/api/orders", orderRoutes);
// ... etc

// ============================================================================
// 404 HANDLER
// ============================================================================

app.use((req, res) => {
  res.status(404).json({
    error: "NOT_FOUND",
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ============================================================================
// GLOBAL ERROR HANDLER
// ============================================================================

app.use((err, req, res, next) => {
  console.error("❌ Unhandled error:", err);

  // Sequelize validation errors
  if (err.name === "SequelizeValidationError") {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "Validation failed",
      details: err.errors.map((e) => ({
        field: e.path,
        message: e.message,
      })),
    });
  }

  // Sequelize unique constraint errors
  if (err.name === "SequelizeUniqueConstraintError") {
    return res.status(409).json({
      error: "DUPLICATE_ERROR",
      message: "A record with this value already exists",
      details: err.errors.map((e) => ({
        field: e.path,
        message: e.message,
      })),
    });
  }

  // JWT errors (will be useful in Phase 3)
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({
      error: "INVALID_TOKEN",
      message: "Invalid or malformed token",
    });
  }

  if (err.name === "TokenExpiredError") {
    return res.status(401).json({
      error: "TOKEN_EXPIRED",
      message: "Token has expired",
    });
  }

  // Default: Internal Server Error
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: "INTERNAL_ERROR",
    message: env.isProduction
      ? "An unexpected error occurred"
      : err.message || "An unexpected error occurred",
    ...(env.isDevelopment && { stack: err.stack }),
  });
});

module.exports = app;