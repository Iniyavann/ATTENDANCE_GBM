const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOADS_DIR = path.resolve(process.cwd(), process.env.UPLOADS_DIR || './uploads/attendance');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = ALLOWED_TYPES[file.mimetype] || '.jpg';
    const unique = Date.now() + '-' + crypto.randomBytes(8).toString('hex');
    cb(null, `${unique}${ext}`);
  }
});

function fileFilter(req, file, cb) {
  if (!ALLOWED_TYPES[file.mimetype]) {
    return cb(new Error('Only JPEG, PNG or WEBP images are allowed.'));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

module.exports = { upload, UPLOADS_DIR };
