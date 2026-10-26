// Start-code encryption (AES-256-GCM). Node only: import from '@fleet-hub/shared/crypto'.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

function keyFrom(base64Key: string): Buffer {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('FLEET_CODE_KEY must be 32 bytes, base64-encoded');
  return key;
}

/** Returns `v1:<iv>:<tag>:<ciphertext>`, all base64. */
export function encryptStartCode(plain: string, base64Key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(base64Key), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext]
    .map((p) => (typeof p === 'string' ? p : p.toString('base64')))
    .join(':');
}

export function decryptStartCode(stored: string, base64Key: string): string {
  const [version, iv, tag, ciphertext] = stored.split(':');
  if (version !== VERSION || !iv || !tag || !ciphertext)
    throw new Error('Unrecognized start code format');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(base64Key), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
