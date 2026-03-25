/**
 * Shopify OAuth Routes (TEMPORARY — one-time use to get access token)
 *
 * Flow:
 *   1. Visit GET /api/shopify/auth/install in browser
 *      → Redirects to Shopify authorization page
 *   2. User grants permission on Shopify
 *      → Shopify redirects to GET /api/shopify/auth/callback with ?code=...
 *   3. Callback exchanges code for permanent access token
 *      → Token is printed to terminal console
 *   4. Copy token to .env as SHOPIFY_ACCESS_TOKEN=shpat_...
 *   5. Delete this file (no longer needed)
 *
 * Mounted at /api/shopify/auth in app.js
 */

const { Router } = require("express");
const crypto = require("crypto");
const env = require("../config/environment");

const router = Router();

// ─── Helper: generate a random nonce for CSRF protection ────────────────────
function generateNonce() {
  return crypto.randomBytes(16).toString("hex");
}

// ─── Helper: verify HMAC from Shopify callback query params ─────────────────
function verifyHmac(query) {
  const { hmac, ...rest } = query;
  if (!hmac) return false;

  // Sort params alphabetically and build the message string
  const message = Object.keys(rest)
    .sort()
    .map((key) => `${key}=${rest[key]}`)
    .join("&");

  const generatedHmac = crypto
    .createHmac("sha256", env.shopify.apiSecret)
    .update(message)
    .digest("hex");

  // Timing-safe comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(hmac, "hex"),
      Buffer.from(generatedHmac, "hex")
    );
  } catch {
    return false;
  }
}

// ─── In-memory nonce store (fine for one-time use) ──────────────────────────
let storedNonce = null;

/**
 * GET /api/shopify/auth/install
 *
 * Step 1: Visit this URL in your browser.
 * It redirects you to Shopify's authorization page.
 */
router.get("/install", (req, res) => {
  const { storeUrl, apiKey, scopes } = env.shopify;

  if (!storeUrl || !apiKey) {
    return res.status(500).json({
      error: "MISSING_CONFIG",
      message:
        "SHOPIFY_STORE_URL and SHOPIFY_API_KEY must be set in .env before running OAuth.",
    });
  }

  // Generate nonce for CSRF protection
  storedNonce = generateNonce();

  // Build the ngrok callback URL from the request's host header
  const protocol = req.headers["x-forwarded-proto"] || req.protocol;
  const host = req.headers["x-forwarded-host"] || req.get("host");
  const redirectUri = `${protocol}://${host}/api/shopify/auth/callback`;

  // Build Shopify authorization URL
  const authUrl =
    `https://${storeUrl}/admin/oauth/authorize` +
    `?client_id=${apiKey}` +
    `&scope=${scopes}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${storedNonce}`;

  console.log("\n🔗 Redirecting to Shopify OAuth...");
  console.log(`   Store: ${storeUrl}`);
  console.log(`   Redirect URI: ${redirectUri}`);
  console.log(`   Nonce: ${storedNonce}\n`);

  res.redirect(authUrl);
});

/**
 * GET /api/shopify/auth/callback
 *
 * Step 2: Shopify redirects here after the user grants permission.
 * We exchange the temporary code for a permanent access token.
 */
router.get("/callback", async (req, res) => {
  try {
    const { code, hmac, state, shop, host: shopHost, timestamp } = req.query;

    // ── Validate required params ──────────────────────────────────────
    if (!code || !hmac || !state || !shop) {
      return res.status(400).json({
        error: "MISSING_PARAMS",
        message: "Missing required OAuth callback parameters (code, hmac, state, shop).",
        received: { code: !!code, hmac: !!hmac, state: !!state, shop: !!shop },
      });
    }

    // ── Verify nonce (CSRF protection) ────────────────────────────────
    if (state !== storedNonce) {
      return res.status(403).json({
        error: "INVALID_NONCE",
        message: "OAuth state/nonce mismatch. Possible CSRF attack. Try /install again.",
      });
    }

    // Clear the nonce after use
    storedNonce = null;

    // ── Verify HMAC ───────────────────────────────────────────────────
    const isValid = verifyHmac(req.query);
    if (!isValid) {
      return res.status(403).json({
        error: "INVALID_HMAC",
        message: "HMAC verification failed. The request may have been tampered with.",
      });
    }

    // ── Verify shop hostname matches our configured store ─────────────
    if (shop !== env.shopify.storeUrl) {
      return res.status(403).json({
        error: "SHOP_MISMATCH",
        message: `Expected shop ${env.shopify.storeUrl}, got ${shop}.`,
      });
    }

    // ── Exchange code for permanent access token ──────────────────────
    console.log("\n🔄 Exchanging authorization code for access token...");
    console.log(`   Shop: ${shop}`);
    console.log(`   Code: ${code.substring(0, 8)}...`);

    const tokenUrl = `https://${shop}/admin/oauth/access_token`;
    const tokenBody = {
      client_id: env.shopify.apiKey,
      client_secret: env.shopify.apiSecret,
      code: code,
    };

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tokenBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Token exchange failed:", response.status, errorText);
      return res.status(response.status).json({
        error: "TOKEN_EXCHANGE_FAILED",
        message: `Shopify returned ${response.status}: ${errorText}`,
      });
    }

    const tokenData = await response.json();
    const accessToken = tokenData.access_token;
    const grantedScopes = tokenData.scope;

    // ── Print the token to the terminal ───────────────────────────────
    console.log("\n" + "=".repeat(70));
    console.log("✅ SHOPIFY ACCESS TOKEN OBTAINED SUCCESSFULLY!");
    console.log("=".repeat(70));
    console.log(`\n   Access Token: ${accessToken}`);
    console.log(`   Scopes:       ${grantedScopes}`);
    console.log(`\n   👉 Add this to your .env file:`);
    console.log(`   SHOPIFY_ACCESS_TOKEN=${accessToken}`);
    console.log("\n" + "=".repeat(70));
    console.log("   ⚠️  This token is shown ONCE. Copy it now!");
    console.log("   After adding to .env, you can delete shopifyAuthRoutes.js");
    console.log("=".repeat(70) + "\n");

    // ── Return success page to the browser ────────────────────────────
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Shopify OAuth — Success</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              max-width: 600px;
              margin: 80px auto;
              padding: 0 20px;
              background: #0a0a0a;
              color: #e0e0e0;
            }
            .card {
              background: #1a1a1a;
              border: 1px solid #333;
              border-radius: 12px;
              padding: 32px;
            }
            h1 { color: #4ade80; margin-top: 0; }
            .token {
              background: #0d1117;
              border: 1px solid #30363d;
              border-radius: 6px;
              padding: 12px 16px;
              font-family: 'SF Mono', Monaco, monospace;
              font-size: 13px;
              word-break: break-all;
              color: #f0883e;
              margin: 16px 0;
            }
            .scopes {
              color: #8b949e;
              font-size: 14px;
            }
            .warning {
              background: #1c1917;
              border: 1px solid #854d0e;
              border-radius: 6px;
              padding: 12px 16px;
              margin-top: 16px;
              font-size: 14px;
              color: #fbbf24;
            }
            .step {
              background: #0d1117;
              border-radius: 6px;
              padding: 12px 16px;
              margin-top: 12px;
              font-family: 'SF Mono', Monaco, monospace;
              font-size: 13px;
              color: #79c0ff;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>✅ Shopify OAuth Complete</h1>
            <p>Your permanent access token has been generated:</p>
            <div class="token">${accessToken}</div>
            <p class="scopes">Granted scopes: ${grantedScopes}</p>
            <div class="warning">
              ⚠️ This token is shown <strong>once</strong>. Copy it now!
            </div>
            <p style="margin-top: 20px;">Add it to your <code>.env</code> file:</p>
            <div class="step">SHOPIFY_ACCESS_TOKEN=${accessToken}</div>
            <p style="margin-top: 20px; color: #8b949e;">
              After adding to .env, restart your backend server and delete 
              <code>shopifyAuthRoutes.js</code> — it's no longer needed.
            </p>
          </div>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("❌ OAuth callback error:", error);
    res.status(500).json({
      error: "OAUTH_ERROR",
      message: error.message,
    });
  }
});

module.exports = router;