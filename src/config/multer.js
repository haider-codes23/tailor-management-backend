/**
 * Multer Configurations
 *
 * - videoUpload: temporary storage for QA videos before YouTube upload
 * - receiptUpload: persistent storage for payment receipts (images or PDFs)
 */

const multer = require("multer");
const path = require("path");
const fs = require("fs");

// ─── Uploads directory ───────────────────────────────────────────────
const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ─── Receipts subdirectory ───────────────────────────────────────────
const receiptsDir = path.join(uploadsDir, "receipts");
if (!fs.existsSync(receiptsDir)) {
  fs.mkdirSync(receiptsDir, { recursive: true });
}

// =========================================================================
// Video Upload (QA videos, temporary → uploaded to YouTube then deleted)
// =========================================================================

const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
];

const videoUpload = multer({
  storage: videoStorage,
  fileFilter: (req, file, cb) => {
    if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) cb(null, true);
    else
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: MP4, MOV, AVI, WebM`), false);
  },
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
});

// =========================================================================
// Receipt Upload (payment proofs, stored persistently)
// =========================================================================

const receiptStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, receiptsDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const ext = path.extname(file.originalname);
    cb(null, `receipt-${unique}${ext}`);
  },
});

const ALLOWED_RECEIPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const receiptUpload = multer({
  storage: receiptStorage,
  fileFilter: (req, file, cb) => {
    if (ALLOWED_RECEIPT_TYPES.includes(file.mimetype)) cb(null, true);
    else
      cb(
        new Error(
          `Invalid file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP, PDF`
        ),
        false
      );
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

module.exports = { videoUpload, receiptUpload };