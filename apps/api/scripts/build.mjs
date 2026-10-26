// Bundles the API into dist/server.js. Workspace packages are inlined; npm packages stay external.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
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
console.log('Built dist/server.js');
