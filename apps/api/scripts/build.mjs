// Bundles the API into dist/: the server and the first-run admin command. Workspace packages are
// inlined; npm packages stay external.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server.ts', 'src/create-admin.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  plugins: [
    {
      name: 'externalize-npm-packages',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) =>
          args.path.startsWith('@fleet-hub/') ? undefined : { path: args.path, external: true },
        );
      },
    },
  ],
});
console.log('Built dist/server.js and dist/create-admin.js');
