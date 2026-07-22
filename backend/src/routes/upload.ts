import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../middleware/auth';

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.post('/', requireAuth, upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No se recibio ningun archivo' });
  }

  const baseUrl = process.env.BACKEND_URL || 'http://localhost:3000';
  const url = `${baseUrl}/uploads/${req.file.filename}`;

  res.json({
    success: true,
    url,
    originalName: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
  });
});

export default router;
