import { createHash, randomBytes } from 'node:crypto';

/** A URL-safe single-use token (the raw value is emailed; only its hash is stored). */
export const newToken = (): string => randomBytes(32).toString('base64url');

/** SHA-256 hex of a token, for at-rest storage and constant-work comparison. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
