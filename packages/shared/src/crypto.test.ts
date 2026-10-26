import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptStartCode, encryptStartCode } from './crypto';

const key = randomBytes(32).toString('base64');

describe('start code crypto', () => {
  it('round-trips and never stores the plain code', () => {
    const stored = encryptStartCode('4821', key);
    expect(stored).not.toContain('4821');
    expect(decryptStartCode(stored, key)).toBe('4821');
  });

  it('uses a fresh IV every time', () => {
    expect(encryptStartCode('4821', key)).not.toBe(encryptStartCode('4821', key));
  });

  it('rejects a tampered value or the wrong key', () => {
    const stored = encryptStartCode('4821', key);
    const parts = stored.split(':');
    parts[3] = Buffer.from('9999').toString('base64');
    expect(() => decryptStartCode(parts.join(':'), key)).toThrow();
    expect(() => decryptStartCode(stored, randomBytes(32).toString('base64'))).toThrow();
  });

  it('rejects a key of the wrong length', () => {
    expect(() => encryptStartCode('1', randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
  });
});
