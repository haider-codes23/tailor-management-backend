/**
 * Server Entry Point
 *
 * This file:
 * 1. Loads environment variables
 * 2. Tests database connection
 * 3. Starts the Express server
 *
 * Kept separate from app.js so we can import app in tests
 * without actually starting the server.
 */

const app = require("./src/app");
const sequelize = require("./src/config/database");
const env = require("./src/config/environment");

async function startServer() {
  try {
    // ========================================================================
    // 1. Test database connection
    // ========================================================================
    console.log("🔌 Testing database connection...");
    await sequelize.authenticate();
    console.log("✅ Database connected successfully");
    console.log(
      `   Host: ${env.db.host}:${env.db.port} | DB: ${env.db.name}`
    );

    // ========================================================================
    // 2. Sync models in development (optional — we'll use migrations instead)
    // ========================================================================
    // In development you CAN use sync to auto-create tables from models,
    // but we'll prefer migrations for a production-grade approach.
    // Uncomment below ONLY if you want quick testing before migrations are ready:
    //
    // if (env.isDevelopment) {
    //   await sequelize.sync({ alter: true });
    //   console.log("📦 Models synced to database");
    // }

    // ========================================================================
    // 3. Start Express server
    // ========================================================================
    app.listen(env.port, () => {
      console.log(`\n🚀 Server running on http://localhost:${env.port}`);
      console.log(`   Environment: ${env.nodeEnv}`);
      console.log(`   Health check: http://localhost:${env.port}/api/health`);
      console.log(`   Frontend URL: ${env.frontendUrl}`);
      console.log("");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error.message);

    if (error.original) {
      console.error("   Database error:", error.original.message);
    }

    console.error("\n💡 Troubleshooting:");
    console.error("   1. Is PostgreSQL running?");
    console.error("   2. Does the database exist? Run: CREATE DATABASE tailor_management;");
    console.error("   3. Are your .env credentials correct?");
    console.error(
      "   4. Can you connect manually? psql -U tailor_admin -d tailor_management"
    );

    process.exit(1);
  }
}

startServer();