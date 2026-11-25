import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.glb': 'model/gltf-binary',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

async function fileAt(p: string) {
  try {
    const s = await stat(p);
    return s.isFile() ? s : null;
  } catch {
    return null;
  }
}

/**
 * Serves the web build from `root` when there is no Caddy in front (the Windows laptop
 * install): the same caching as the Caddyfile, and any page path falls back to index.html.
 */
export function serveWeb(app: FastifyInstance, root: string) {
  const base = path.resolve(root);
  app.setNotFoundHandler(async (req, reply) => {
    const url = decodeURIComponent((req.url.split('?')[0] ?? '/').split('#')[0]!);
    if ((req.method !== 'GET' && req.method !== 'HEAD') || url.startsWith('/api/')) {
      return reply.status(404).send({ error: 'not_found' });
    }
    let file = path.resolve(base, '.' + path.posix.normalize(url));
    if (!file.startsWith(base + path.sep) && file !== base) {
      return reply.status(404).send({ error: 'not_found' });
    }
    let info = await fileAt(file);
    const asset = url.startsWith('/assets/');
    if (!info) {
      // A missing asset is a 404; a page path is the app's own route.
      if (asset || path.extname(url)) return reply.status(404).send({ error: 'not_found' });
      file = path.join(base, 'index.html');
      info = await fileAt(file);
      if (!info) return reply.status(404).send({ error: 'not_found' });
    }
    // The app's own pages: the API's strict CSP is for JSON, not for the web app.
    reply.removeHeader('content-security-policy');
    reply
      .header('content-type', TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream')
      .header('content-length', info.size)
      .header('x-frame-options', 'DENY')
      .header('referrer-policy', 'same-origin')
      .header('cache-control', asset ? 'public, max-age=31536000, immutable' : 'no-cache');
    return reply.send(req.method === 'HEAD' ? '' : createReadStream(file));
  });
}
