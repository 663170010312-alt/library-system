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

/* =========================
   UPLOAD BOOK COVER
   อัปโหลดรูปปกหนังสือ
========================= */

const coverDirectory = path.resolve(
  process.cwd(),
  'uploads',
  'covers'
);

fs.mkdirSync(coverDirectory, {
  recursive: true,
});

const coverStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, coverDirectory);
  },

  filename: (req, file, cb) => {
    const extension = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    }[file.mimetype];

    const filename =
      `cover-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}${extension}`;

    cb(null, filename);
  },
});

const coverUpload = multer({
  storage: coverStorage,

  limits: {
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
          'รองรับเฉพาะ JPG, PNG และ WebP'
        )
      );
    }

    cb(null, true);
  },
});

router.post(
  '/cover',
  authenticate,
  (req, res, next) => {
    if (req.user.role !== 'ADMIN') {
      return next(
        httpError(
          403,
          'เฉพาะผู้ดูแลระบบเท่านั้น'
        )
      );
    }

    coverUpload.single('cover')(
      req,
      res,
      (error) => {
        if (error) {
          return next(error);
        }

        if (!req.file) {
          return next(
            httpError(
              400,
              'กรุณาเลือกรูปปกหนังสือ'
            )
          );
        }

        const coverUrl =
          `${req.protocol}://${req.get('host')}` +
          `/uploads/covers/${req.file.filename}`;

        res.status(201).json({
          message: 'อัปโหลดรูปปกสำเร็จ',
          url: coverUrl,
        });
      }
    );
  }
);
