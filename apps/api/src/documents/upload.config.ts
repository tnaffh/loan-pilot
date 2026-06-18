import { existsSync, mkdirSync } from 'node:fs';
import { extname, isAbsolute, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';

/** Absolute directory where uploaded documents are stored on local disk. */
export const uploadsDir = (() => {
  const configured = process.env.UPLOAD_DIR;
  const dir = configured
    ? isAbsolute(configured)
      ? configured
      : join(process.cwd(), configured)
    : join(process.cwd(), 'uploads');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
})();

const ACCEPTED_MIME = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const MAX_BYTES = 10 * 1024 * 1024;

/** Multer options for document uploads: disk storage, type allow-list, size cap. */
export const documentUploadOptions: MulterOptions = {
  storage: diskStorage({
    destination: uploadsDir,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
  }),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new BadRequestException('Only PDF, JPG or PNG files are accepted'), false);
    }
  },
};
