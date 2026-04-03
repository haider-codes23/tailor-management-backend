/**
 * YouTube Upload Service
 *
 * Handles video uploads to the client's YouTube channel
 * via YouTube Data API v3 with OAuth2 authentication.
 *
 * Flow:
 *   1. QA user uploads a video file via the frontend
 *   2. Multer saves the file temporarily to /uploads
 *   3. This service uploads the file to YouTube
 *   4. YouTube returns the video ID → we build the URL
 *   5. Temporary file is deleted
 */

const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const { createOAuth2Client, YOUTUBE_REFRESH_TOKEN } = require("../config/youtube");

/**
 * Upload a video file to YouTube.
 *
 * @param {Object} params
 * @param {string} params.filePath   - Absolute path to the temp video file
 * @param {string} params.title      - Video title (e.g., "ORD-2026-0017 - Valentina - Kaftan")
 * @param {string} params.description - Video description
 * @param {string} [params.privacyStatus] - "unlisted" (default), "private", or "public"
 * @returns {Promise<{youtubeUrl, youtubeVideoId, thumbnailUrl}>}
 */
async function uploadVideo({ filePath, title, description, privacyStatus = "unlisted" }) {
  if (!YOUTUBE_REFRESH_TOKEN) {
    throw new Error(
      "YouTube refresh token not configured. Visit /api/youtube/oauth/authorize to set it up."
    );
  }

  const oauth2Client = createOAuth2Client();
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  const fileSize = fs.statSync(filePath).size;

  try {
    const res = await youtube.videos.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: title || "QA Video",
          description: description || "Quality assurance video for order review",
          categoryId: "22", // "People & Blogs" — generic category
        },
        status: {
          privacyStatus, // "unlisted" = accessible via link only
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: fs.createReadStream(filePath),
      },
    });

    const videoId = res.data.id;
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const thumbnailUrl = res.data.snippet?.thumbnails?.default?.url || null;

    console.log(`✅ YouTube upload complete: ${youtubeUrl} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`);

    return {
      youtubeUrl,
      youtubeVideoId: videoId,
      thumbnailUrl,
    };
  } finally {
    // Always clean up the temporary file
    try {
      fs.unlinkSync(filePath);
      console.log(`🗑️  Temp file deleted: ${path.basename(filePath)}`);
    } catch (err) {
      console.error(`⚠️  Failed to delete temp file: ${filePath}`, err.message);
    }
  }
}

/**
 * Delete a video from YouTube (optional — for re-uploads).
 *
 * @param {string} videoId - YouTube video ID
 * @returns {Promise<void>}
 */
async function deleteVideo(videoId) {
  if (!YOUTUBE_REFRESH_TOKEN || !videoId) return;

  try {
    const oauth2Client = createOAuth2Client();
    const youtube = google.youtube({ version: "v3", auth: oauth2Client });
    await youtube.videos.delete({ id: videoId });
    console.log(`🗑️  YouTube video deleted: ${videoId}`);
  } catch (err) {
    // Non-fatal — log but don't throw
    console.error(`⚠️  Failed to delete YouTube video ${videoId}:`, err.message);
  }
}

module.exports = {
  uploadVideo,
  deleteVideo,
};