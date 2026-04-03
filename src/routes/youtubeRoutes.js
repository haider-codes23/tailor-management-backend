/**
 * YouTube OAuth Routes
 *
 * One-time setup endpoints for obtaining the YouTube refresh token.
 * After the refresh token is saved to .env, these endpoints are no longer needed
 * but remain available for re-authorization if the token is ever revoked.
 *
 * Mounted at /api/youtube
 */

const express = require("express");
const router = express.Router();
const { getAuthUrl, getTokensFromCode } = require("../config/youtube");

/**
 * GET /api/youtube/oauth/authorize
 * Redirects the user to Google's OAuth consent screen.
 * Visit this URL in the browser to start the authorization flow.
 */
router.get("/oauth/authorize", (req, res) => {
  const url = getAuthUrl();
  console.log("🔑 Redirecting to Google OAuth consent screen...");
  res.redirect(url);
});

/**
 * GET /api/youtube/oauth/callback
 * Google redirects here after the user grants consent.
 * Exchanges the authorization code for tokens and displays the refresh token.
 */
router.get("/oauth/callback", async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    console.error("❌ OAuth error:", error);
    return res.status(400).send(`
      <h1>OAuth Error</h1>
      <p>${error}</p>
      <p>Please try again: <a href="/api/youtube/oauth/authorize">Retry</a></p>
    `);
  }

  if (!code) {
    return res.status(400).send(`
      <h1>Missing Code</h1>
      <p>No authorization code received from Google.</p>
    `);
  }

  try {
    const tokens = await getTokensFromCode(code);

    console.log("✅ YouTube OAuth tokens received!");
    console.log("   Access Token:", tokens.access_token ? "✓ present" : "✗ missing");
    console.log("   Refresh Token:", tokens.refresh_token ? "✓ present" : "✗ missing");

    if (tokens.refresh_token) {
      console.log("\n📋 Copy this refresh token to your .env file:");
      console.log(`   YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    }

    // Display the token in a simple HTML page for easy copying
    res.send(`
      <html>
        <head><title>YouTube OAuth Success</title></head>
        <body style="font-family: monospace; padding: 40px; max-width: 800px; margin: 0 auto;">
          <h1 style="color: green;">✅ YouTube Authorization Successful!</h1>
          
          ${tokens.refresh_token ? `
            <h2>Your Refresh Token:</h2>
            <div style="background: #1a1a1a; color: #00ff00; padding: 20px; border-radius: 8px; word-break: break-all; font-size: 14px;">
              ${tokens.refresh_token}
            </div>
            
            <h3>Next Steps:</h3>
            <ol>
              <li>Copy the refresh token above</li>
              <li>Open your <code>.env</code> file</li>
              <li>Set <code>YOUTUBE_REFRESH_TOKEN=</code> to the token above</li>
              <li>Restart your backend server</li>
              <li>Video uploads will now work automatically!</li>
            </ol>
          ` : `
            <h2 style="color: orange;">⚠️ No Refresh Token Received</h2>
            <p>This can happen if you've already authorized this app before.</p>
            <p>To get a new refresh token:</p>
            <ol>
              <li>Go to <a href="https://myaccount.google.com/permissions" target="_blank">Google Account Permissions</a></li>
              <li>Revoke access for "Tailor Backend"</li>
              <li>Try again: <a href="/api/youtube/oauth/authorize">Re-authorize</a></li>
            </ol>
          `}
        </body>
      </html>
    `);
  } catch (err) {
    console.error("❌ Failed to exchange OAuth code:", err.message);
    res.status(500).send(`
      <h1>Token Exchange Failed</h1>
      <p>${err.message}</p>
      <p><a href="/api/youtube/oauth/authorize">Try again</a></p>
    `);
  }
});

module.exports = router;