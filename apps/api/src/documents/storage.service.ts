import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Storage, type Bucket } from '@google-cloud/storage';
import { uploadsDir } from './upload.config';

interface SaveInput {
  buffer: Buffer;
  contentType: string;
  originalName: string;
}

/** Short-lived signed-URL validity for private documents (seconds). */
const SIGNED_URL_TTL_SECONDS = 600;

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

/**
 * Pluggable document storage:
 *  - `STORAGE_DRIVER=local` (default) writes to the API's disk and serves files
 *    from `/uploads`.
 *  - `STORAGE_DRIVER=gcs` stores in a Google Cloud Storage bucket, authenticating
 *    keylessly via Application Default Credentials (the Cloud Run runtime service
 *    account). Serves a public URL when `GCS_PUBLIC_URL` is set, otherwise a
 *    short-lived V4 signed URL — correct for private, PII-sensitive documents.
 *  - `STORAGE_DRIVER=s3` stores in an S3-compatible bucket (AWS S3 / Cloudflare
 *    R2 / MinIO) and serves a public or short-lived presigned URL.
 */
@Injectable()
export class StorageService {
  private readonly driver = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase();
  private readonly bucket = process.env.S3_BUCKET ?? '';
  private readonly publicBase = process.env.S3_PUBLIC_URL;
  private readonly apiOrigin = process.env.PUBLIC_API_ORIGIN ?? 'http://localhost:4000';
  // GCS
  private readonly gcsBucketName = process.env.GCS_BUCKET ?? '';
  private readonly gcsPublicBase = process.env.GCS_PUBLIC_URL;
  private s3Client?: S3Client;
  private gcsBucketRef?: Bucket;

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

  /** Lazily resolve the GCS bucket; credentials come from ADC (no static keys). */
  private gcsBucket(): Bucket {
    if (!this.gcsBucketRef) {
      this.gcsBucketRef = new Storage().bucket(this.gcsBucketName);
    }
    return this.gcsBucketRef;
  }

  /** Persist a document and return its opaque storage key. */
  async save({ buffer, contentType, originalName }: SaveInput): Promise<{ key: string }> {
    const key = `documents/${randomUUID()}${extname(originalName)}`;
    if (this.driver === 'gcs') {
      await this.gcsBucket().file(key).save(buffer, { contentType, resumable: false });
    } else if (this.driver === 's3') {
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
    if (this.driver === 'gcs') {
      if (this.gcsPublicBase) {
        return `${trimTrailingSlash(this.gcsPublicBase)}/${key}`;
      }
      const [url] = await this.gcsBucket()
        .file(key)
        .getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + SIGNED_URL_TTL_SECONDS * 1000,
        });
      return url;
    }
    if (this.driver === 's3') {
      if (this.publicBase) {
        return `${trimTrailingSlash(this.publicBase)}/${key}`;
      }
      return getSignedUrl(this.client(), new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
        expiresIn: SIGNED_URL_TTL_SECONDS,
      });
    }
    return `${trimTrailingSlash(this.apiOrigin)}/uploads/${key}`;
  }
}
