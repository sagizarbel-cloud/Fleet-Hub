import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { serveWeb } from '../src/plugins/web-static';
import { makeApp } from './helpers';

describe('serving the web build (WEB_DIR)', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fh-web-'));
  mkdirSync(path.join(dir, 'assets'));
  writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>Fleet Hub</title>');
  writeFileSync(path.join(dir, 'assets', 'app-abc.js'), 'console.log(1)');
  writeFileSync(path.join(tmpdir(), 'fh-secret.txt'), 'no');
  let app: Awaited<ReturnType<typeof makeApp>>;
  beforeAll(async () => {
    app = await makeApp((a) => serveWeb(a, dir));
  });
  afterAll(() => app.close());

  it('serves assets with long caching and pages with index.html', async () => {
    const js = await app.inject({ url: '/assets/app-abc.js' });
    expect(js.statusCode).toBe(200);
    expect(js.headers['content-type']).toMatch(/javascript/);
    expect(js.headers['cache-control']).toMatch(/immutable/);
    for (const url of ['/', '/vehicles/EX-1?tab=history', '/settings/import']) {
      const page = await app.inject({ url });
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain('<title>Fleet Hub</title>');
      expect(page.headers['cache-control']).toBe('no-cache');
      expect(page.headers['content-security-policy']).toBeUndefined();
    }
  });

  it('keeps api 404s as JSON, misses as 404, and stays inside the folder', async () => {
    expect((await app.inject({ url: '/api/nope' })).json()).toEqual({ error: 'not_found' });
    expect((await app.inject({ url: '/assets/gone.js' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/missing.png' })).statusCode).toBe(404);
    const out = await app.inject({ url: '/..%2ffh-secret.txt' });
    expect(out.body).not.toBe('no');
    expect((await app.inject({ method: 'POST', url: '/x' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/health' })).statusCode).toBe(200);
  });
});
