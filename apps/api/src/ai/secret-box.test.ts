import { SecretBox } from './secret-box';

describe('SecretBox', () => {
  const box = new SecretBox();

  it('round-trips a secret and never stores it in the clear', () => {
    const sealed = box.encrypt('sk-ant-api03-secret-value');

    expect(sealed.startsWith('v1:')).toBe(true);
    expect(sealed).not.toContain('secret-value');
    expect(box.decrypt(sealed)).toBe('sk-ant-api03-secret-value');
  });

  it('uses a fresh IV per value', () => {
    expect(box.encrypt('same')).not.toBe(box.encrypt('same'));
  });

  it('returns null for tampered or foreign values instead of throwing', () => {
    const [version, iv, tag, ciphertext] = box.encrypt('value').split(':');
    const flipped = Buffer.from(ciphertext ?? '', 'base64');

    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    expect(box.decrypt([version, iv, tag, flipped.toString('base64')].join(':'))).toBeNull();
    expect(box.decrypt('not-a-sealed-value')).toBeNull();
  });
});
