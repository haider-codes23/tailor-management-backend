/**
 * Environment Configuration
 *
 * Loads and validates all environment variables.
 * If a required variable is missing, the server refuses to start
 * rather than failing silently later.
 */

const dotenv = require("dotenv");
dotenv.config();

const requiredVars = [
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "DB_USER",
  "DB_PASSWORD",
  "JWT_ACCESS_SECRET",
  "JWT_REFRESH_SECRET",
];

const missing = requiredVars.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(
    `❌ Missing required environment variables: ${missing.join(", ")}`
  );
  console.error("   Check your .env file against .env.example");
  process.exit(1);
}

module.exports = {
  // Database
  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10),
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    dialect: process.env.DB_DIALECT || "postgres",
    logging: process.env.DB_LOGGING === "true",
  },

  // App
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  isProduction: process.env.NODE_ENV === "production",
  isDevelopment: process.env.NODE_ENV === "development",

  // Auth
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiry: process.env.ACCESS_TOKEN_EXPIRY || "15m",
    refreshExpiry: process.env.REFRESH_TOKEN_EXPIRY || "7d",
  },

  // Frontend
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",

  // Shopify
  shopify: {
    storeUrl: process.env.SHOPIFY_STORE_URL,
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecret: process.env.SHOPIFY_API_SECRET,
    apiVersion: process.env.SHOPIFY_API_VERSION || "2026-01",
    scopes: process.env.SHOPIFY_SCOPES || "read_customers,read_fulfillments,write_fulfillments,read_inventory,read_orders,write_orders,read_products,write_products",
    accessToken: process.env.SHOPIFY_ACCESS_TOKEN,
  },
};