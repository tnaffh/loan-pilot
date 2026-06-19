import { existsSync, mkdirSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { memoryStorage } from 'multer';

/** Absolute directory where uploaded documents are stored on local disk. */
export const uploadsDir = (() => {
  const configured = process.env.UPLOAD_DIR;
  const dir = configured
    ? isAbsolute(configured)
      ? configured
      : join(process.cwd(), configured)
    : join(process.cwd(), 'uploads');
  // Only create the directory for the local driver. On Cloud Run the working
  // directory is read-only (only /tmp is writable), so creating it eagerly when
  // documents live in GCS/S3 would crash the API on boot.
  const driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
  if (driver === 'local' && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
})();

const ACCEPTED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Multer options for document uploads: buffer the file in memory (so the
 * StorageService can persist it to disk or S3), with a type allow-list + size cap.
 */
export const documentUploadOptions: MulterOptions = {
  storage: memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestException('Only PDF, JPG or PNG files are accepted'), false);
    }
  },
};
