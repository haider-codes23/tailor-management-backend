/**
 * YouTube OAuth2 Configuration
 *
 * Used by youtubeService.js to authenticate and upload videos
 * to the client's YouTube channel via YouTube Data API v3.
 */

const { google } = require("googleapis");

const YOUTUBE_CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const YOUTUBE_CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
const YOUTUBE_REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI;
const YOUTUBE_REFRESH_TOKEN = process.env.YOUTUBE_REFRESH_TOKEN;

// Scope: upload videos only
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload"];

/**
 * Create a fresh OAuth2 client instance.
 * If a refresh token is available, set it so the client can auto-refresh.
 */
function createOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET,
    YOUTUBE_REDIRECT_URI
  );

  if (YOUTUBE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({ refresh_token: YOUTUBE_REFRESH_TOKEN });
  }

  return oauth2Client;
}

/**
 * Generate the authorization URL for the one-time consent flow.
 */
function getAuthUrl() {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline", // ensures we get a refresh_token
    prompt: "consent",      // force consent to always get refresh_token
    scope: SCOPES,
  });
}

/**
 * Exchange an authorization code for tokens.
 * @param {string} code - The authorization code from Google's callback
 * @returns {Promise<{access_token, refresh_token, ...}>}
 */
async function getTokensFromCode(code) {
  const https = require("https");
  const querystring = require("querystring");

  const postData = querystring.stringify({
    code,
    client_id: YOUTUBE_CLIENT_ID,
    client_secret: YOUTUBE_CLIENT_SECRET,
    redirect_uri: YOUTUBE_REDIRECT_URI,
    grant_type: "authorization_code",
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: "oauth2.googleapis.com",
      path: "/token",
      method: "POST",
      family: 4, // Force IPv4
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        console.log("Token exchange response:", data);
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error_description || parsed.error));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error("Failed to parse token response: " + data.substring(0, 200)));
        }
      });
    });

    req.on("error", (e) => {
      console.error("HTTPS request error:", e.message, e.code);
      reject(new Error(`Token request failed: ${e.message}`));
    });

    req.write(postData);
    req.end();
  });
}

module.exports = {
  createOAuth2Client,
  getAuthUrl,
  getTokensFromCode,
  SCOPES,
  YOUTUBE_REFRESH_TOKEN,
};