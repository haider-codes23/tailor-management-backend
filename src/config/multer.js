/**
 * Multer Configuration for Video Uploads
 *
 * Stores uploaded files temporarily in /uploads before
 * they are sent to YouTube and then deleted.
 */

const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Unique filename: timestamp-random-originalname
    const unique = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",   // .mov
  "video/x-msvideo",   // .avi
  "video/webm",
];

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

const fileFilter = (req, file, cb) => {
  if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        `Invalid file type: ${file.mimetype}. Allowed: MP4, MOV, AVI, WebM`
      ),
      false
    );
  }
};

const videoUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

module.exports = { videoUpload };