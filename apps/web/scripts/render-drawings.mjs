// Renders the 3D vehicle models into flat drawings (src/drawings/generated/<type>.json).
// three.js runs only here, at build time; the site loads the finished drawings.
//   pnpm --filter @fleet-hub/web drawings [type ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({
  root,
  configFile: join(root, 'vite.config.ts'),
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  optimizeDeps: { noDiscovery: true, entries: [] },
  logLevel: 'error',
});
try {
  const { MODELS } = await server.ssrLoadModule('/src/drawings/three/models/index.ts');
  const { renderView } = await server.ssrLoadModule('/src/drawings/three/render.ts');
  const only = process.argv.slice(2);
  const out = join(root, 'src/drawings/generated');
  mkdirSync(out, { recursive: true });
  for (const [type, spec] of Object.entries(MODELS)) {
    if (only.length && !only.includes(type)) continue;
    const started = Date.now();
    const views = Object.fromEntries(
      ['top', 'side', 'iso'].map((view) => [view, renderView(spec.build(view), view, spec.unit)]),
    );
    writeFileSync(join(out, `${type}.json`), `${JSON.stringify(views)}\n`);
    console.log(`${type}: ${Date.now() - started} ms`);
  }
} finally {
  await server.close();
}
