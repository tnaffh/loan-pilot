import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { JWT_DEFAULT_SECRET } from '../auth/jwt.strategy';

const VERSION = 'v1';
const IV_BYTES = 12;

/**
 * Symmetric encryption for third-party secrets stored in the database (AI
 * provider API keys). AES-256-GCM with a random IV per value; the stored form is
 * `v1:<iv>:<tag>:<ciphertext>` (base64 parts), so a later key or algorithm
 * change can be recognised by its prefix.
 *
 * The key comes from `SECRETS_KEY`, falling back to `JWT_SECRET`. With the
 * fallback, rotating the JWT secret makes stored API keys unreadable — they
 * then have to be entered again under Settings → AI review.
 */
@Injectable()
export class SecretBox {
  private readonly key = createHash('sha256')
    .update(process.env.SECRETS_KEY || process.env.JWT_SECRET || JWT_DEFAULT_SECRET)
    .digest();

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return [VERSION, iv, cipher.getAuthTag(), ciphertext]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64')))
      .join(':');
  }

  /** Decrypt a stored value; null when it was sealed with another key or is corrupt. */
  decrypt(sealed: string): string | null {
    const [version, iv, tag, ciphertext] = sealed.split(':');

    if (version !== VERSION || !iv || !tag || !ciphertext) {
      return null;
    }

    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64'));

      decipher.setAuthTag(Buffer.from(tag, 'base64'));

      return Buffer.concat([
        decipher.update(Buffer.from(ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return null;
    }
  }
}
