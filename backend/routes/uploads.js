import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from './auth.js';
import { httpError } from '../db.js';

const router = Router();

const uploadDirectory = path.resolve(
  process.cwd(),
  'uploads',
  'slips'
);

// ถ้ายังไม่มีโฟลเดอร์ ให้สร้างให้อัตโนมัติ
fs.mkdirSync(uploadDirectory, {
  recursive: true,
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },

  filename: (req, file, cb) => {
    const extension =
      path.extname(file.originalname).toLowerCase();

    const fileName =
      `slip-${req.user.id}-${Date.now()}${extension}`;

    cb(null, fileName);
  },
});

const upload = multer({
  storage,

  limits: {
    // สูงสุด 5 MB
    fileSize: 5 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg',
      'image/png',
      'image/webp',
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(
        httpError(
          400,
          'รองรับเฉพาะรูป JPG, PNG หรือ WEBP'
        )
      );
    }

    cb(null, true);
  },
});

router.post(
  '/slip',
  authenticate,
  upload.single('slip'),
  (req, res) => {
    if (!req.file) {
      throw httpError(
        400,
        'กรุณาเลือกรูปสลิป'
      );
    }

    const slipUrl =
      `${req.protocol}://${req.get('host')}` +
      `/uploads/slips/${req.file.filename}`;

    res.status(201).json({
      message: 'อัปโหลดสลิปแล้ว',
      url: slipUrl,
    });
  }
);

export default router;