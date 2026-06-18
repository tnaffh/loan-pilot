import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { uploadsDir } from './upload.config';

interface SaveInput {
  buffer: Buffer;
  contentType: string;
  originalName: string;
}

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

/**
 * Pluggable document storage. `STORAGE_DRIVER=local` (default) writes to the
 * API's disk and serves files from `/uploads`; `STORAGE_DRIVER=s3` stores in an
 * S3-compatible bucket (AWS S3 / Cloudflare R2 / MinIO) and serves either a
 * public URL or a short-lived presigned URL.
 */
@Injectable()
export class StorageService {
  private readonly driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
  private readonly bucket = process.env.S3_BUCKET ?? '';
  private readonly publicBase = process.env.S3_PUBLIC_URL;
  private readonly apiOrigin = process.env.PUBLIC_API_ORIGIN ?? 'http://localhost:4000';
  private s3Client?: S3Client;

  private client(): S3Client {
    if (!this.s3Client) {
      const accessKeyId = process.env.S3_ACCESS_KEY_ID;
      const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
      this.s3Client = new S3Client({
        region: process.env.S3_REGION ?? 'auto',
        endpoint: process.env.S3_ENDPOINT || undefined,
        // Path-style addressing is required by R2/MinIO custom endpoints.
        forcePathStyle: Boolean(process.env.S3_ENDPOINT),
        credentials:
          accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
      });
    }
    return this.s3Client;
  }

  /** Persist a document and return its opaque storage key. */
  async save({ buffer, contentType, originalName }: SaveInput): Promise<{ key: string }> {
    const key = `documents/${randomUUID()}${extname(originalName)}`;
    if (this.driver === 's3') {
      await this.client().send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: contentType }),
      );
    } else {
      const destination = join(uploadsDir, key);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, buffer);
    }
    return { key };
  }

  /** Resolve a storage key to a URL a browser can open. */
  async accessUrl(key: string): Promise<string> {
    if (this.driver === 's3') {
      if (this.publicBase) {
        return `${trimTrailingSlash(this.publicBase)}/${key}`;
      }
      return getSignedUrl(this.client(), new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
        expiresIn: 600,
      });
    }
    return `${trimTrailingSlash(this.apiOrigin)}/uploads/${key}`;
  }
}
