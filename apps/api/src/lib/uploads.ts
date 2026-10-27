import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { HttpError } from './http';
import { looksLikeSvg, sanitizeSvg } from './svg';

/** Accepted file types, recognised by their first bytes rather than the name or browser label. */
const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: 'png',
    test: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    test: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
  },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.toString('latin1', 0, 5) === '%PDF-' },
];

export function sniff(buf: Buffer) {
  return SIGNATURES.find((s) => s.test(buf)) ?? null;
}

/** A display name only: no folders, no control characters, at most 200 characters. */
export function cleanFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (clean || 'file').slice(0, 200);
}

/** Resolves a stored relative path inside the upload folder, refusing anything that escapes it. */
export function resolveStored(root: string, rel: string) {
  const base = path.resolve(root);
  const full = path.resolve(base, rel);
  if (!full.startsWith(base + path.sep)) throw new HttpError(404, 'not_found');
  return full;
}

/** Writes the file (and a small WebP thumbnail for photos) under UPLOAD_DIR/yyyy/mm/. */
export async function storeUpload(root: string, buf: Buffer) {
  const type = sniff(buf);
  if (!type) throw new HttpError(415, 'unsupported_type');
  const now = new Date();
  const dir = path.join(
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
  );
  await mkdir(path.join(path.resolve(root), dir), { recursive: true });
  const name = randomBytes(16).toString('hex');
  const storagePath = path.join(dir, `${name}.${type.ext}`);
  await writeFile(resolveStored(root, storagePath), buf, { flag: 'wx' });

  let thumbPath: string | null = null;
  if (type.mime.startsWith('image/')) {
    try {
      const thumb = await sharp(buf)
        .rotate()
        .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 70 })
        .toBuffer();
      thumbPath = path.join(dir, `${name}.thumb.webp`);
      await writeFile(resolveStored(root, thumbPath), thumb, { flag: 'wx' });
    } catch {
      // A photo sharp can't read is still stored; it just has no thumbnail.
      thumbPath = null;
    }
  }
  return { mimeType: type.mime, storagePath, thumbPath, sizeBytes: buf.length };
}

export const readStored = (root: string, rel: string) => readFile(resolveStored(root, rel));

/** Longest side of a stored vehicle photo: sharp enough for the vehicle page, small to keep. */
const PHOTO_MAX_PX = 1600;

/**
 * A vehicle's photo or custom drawing (SPEC A4, 5.8). Photos are re-encoded as WebP at most
 * 1600 px (which also drops their location data); a drawing can also be an SVG, kept only
 * after it has been cleaned.
 */
export async function storePicture(root: string, buf: Buffer, allowSvg: boolean) {
  const now = new Date();
  const dir = path.join(
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
  );
  await mkdir(path.join(path.resolve(root), dir), { recursive: true });
  const name = randomBytes(16).toString('hex');

  if (allowSvg && looksLikeSvg(buf)) {
    const clean = sanitizeSvg(buf.toString('utf8'));
    if (!clean) throw new HttpError(415, 'unsupported_type');
    const out = Buffer.from(clean, 'utf8');
    const storagePath = path.join(dir, `${name}.svg`);
    await writeFile(resolveStored(root, storagePath), out, { flag: 'wx' });
    return { mimeType: 'image/svg+xml', storagePath, thumbPath: null, sizeBytes: out.length };
  }

  const type = sniff(buf);
  if (!type || !type.mime.startsWith('image/')) throw new HttpError(415, 'unsupported_type');
  let photo: Buffer;
  let thumb: Buffer;
  try {
    const img = sharp(buf).rotate();
    photo = await img
      .clone()
      .resize(PHOTO_MAX_PX, PHOTO_MAX_PX, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    thumb = await img
      .clone()
      .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70 })
      .toBuffer();
  } catch {
    throw new HttpError(415, 'unreadable_image');
  }
  const storagePath = path.join(dir, `${name}.webp`);
  const thumbPath = path.join(dir, `${name}.thumb.webp`);
  await writeFile(resolveStored(root, storagePath), photo, { flag: 'wx' });
  await writeFile(resolveStored(root, thumbPath), thumb, { flag: 'wx' });
  return { mimeType: 'image/webp', storagePath, thumbPath, sizeBytes: photo.length };
}
