// Builds the Windows laptop install: build/windows/FleetHub-Windows.zip. Everything it needs
// is inside (Node, PostgreSQL, the api with Windows native modules, the web build), so the
// laptop needs no internet, no admin rights and no Docker. See docs/WINDOWS.md.
//
//   pnpm package:windows            (YARD_PLAY from the environment or .env, like pnpm build)
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const NODE_VERSION = '22.23.5';
// PostgreSQL 16 (as on the server) for Windows x64, from the embedded-postgres npm build.
const PG_PACKAGE = '@embedded-postgres/windows-x64@16.16.0-beta.19';

const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'build', 'windows');
const stage = path.join(out, 'FleetHub');
const cache = path.join(out, 'cache');
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });

rmSync(stage, { recursive: true, force: true });
mkdirSync(cache, { recursive: true });

console.log('• Building web and api');
run('pnpm', ['--filter', '@fleet-hub/web', 'build']);
run('pnpm', ['--filter', '@fleet-hub/api', 'build']);

console.log('• Staging the app');
const api = path.join(stage, 'app', 'api');
mkdirSync(api, { recursive: true });
cpSync(path.join(root, 'apps/api/dist'), path.join(api, 'dist'), { recursive: true });
cpSync(path.join(root, 'apps/api/prisma/migrations'), path.join(api, 'prisma/migrations'), {
  recursive: true,
});
// The Windows engine is the only one the laptop needs.
const schema = readFileSync(path.join(root, 'apps/api/prisma/schema.prisma'), 'utf8').replace(
  /binaryTargets\s*=\s*\[[^\]]*\]/,
  'binaryTargets = ["native", "windows"]',
);
writeFileSync(path.join(api, 'prisma/schema.prisma'), schema);
cpSync(path.join(root, 'apps/web/dist'), path.join(stage, 'app', 'web'), { recursive: true });

// The api's npm packages, flat (no symlinks, which a zip can't carry), with the Windows x64
// builds of its native modules (argon2, sharp) instead of this machine's.
const pkg = JSON.parse(readFileSync(path.join(root, 'apps/api/package.json'), 'utf8'));
const deps = Object.fromEntries(
  Object.entries(pkg.dependencies).filter(([name]) => !name.startsWith('@fleet-hub/')),
);
writeFileSync(
  path.join(api, 'package.json'),
  JSON.stringify(
    { name: 'fleet-hub-api', private: true, type: 'module', dependencies: deps },
    null,
    2,
  ),
);
run(
  'npm',
  [
    'install',
    '--omit=dev',
    '--os=win32',
    '--cpu=x64',
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
  ],
  { cwd: api },
);
// Prisma: the Windows query engine in the client, and the Windows schema engine for migrations.
const prismaEnv = {
  ...process.env,
  PRISMA_CLI_BINARY_TARGETS: 'windows',
  PRISMA_HIDE_UPDATE_MESSAGE: '1',
};
run('node', ['node_modules/@prisma/engines/scripts/postinstall.js'], { cwd: api, env: prismaEnv });
run(
  'node',
  ['node_modules/prisma/build/index.js', 'generate', '--schema', 'prisma/schema.prisma'],
  {
    cwd: api,
    env: prismaEnv,
  },
);
// This machine's engines aren't needed on the laptop.
for (const dir of [
  'node_modules/@prisma/engines',
  'node_modules/prisma',
  'node_modules/.prisma/client',
]) {
  const full = path.join(api, dir);
  if (!existsSync(full)) continue;
  for (const f of execFileSync('ls', [full], { encoding: 'utf8' }).split('\n')) {
    if (/(engine|query_engine).*(linux|darwin|debian|rhel|musl)/.test(f))
      rmSync(path.join(full, f), { force: true });
  }
}
for (const need of [
  'node_modules/@node-rs/argon2-win32-x64-msvc',
  'node_modules/@img/sharp-win32-x64',
  'node_modules/.prisma/client/query_engine-windows.dll.node',
]) {
  if (!existsSync(path.join(api, need))) throw new Error(`Missing Windows module: ${need}`);
}
if (
  !execFileSync('ls', [path.join(api, 'node_modules/@prisma/engines')], {
    encoding: 'utf8',
  }).includes('schema-engine-windows.exe')
)
  throw new Error('Missing Windows schema engine');

// Source maps and the WebAssembly fallback of sharp aren't needed to run.
for (const dir of [path.join(stage, 'app')]) {
  for (const f of execFileSync('find', [dir, '-name', '*.map', '-type', 'f'], {
    encoding: 'utf8',
  }).split('\n'))
    if (f) rmSync(f);
}
rmSync(path.join(api, 'node_modules/@img/sharp-wasm32'), { recursive: true, force: true });

console.log('• Node for Windows');
const nodeZip = path.join(cache, `node-v${NODE_VERSION}-win-x64.zip`);
if (!existsSync(nodeZip))
  run('curl', [
    '-fsSL',
    '-o',
    nodeZip,
    `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`,
  ]);
const nodeDir = path.join(stage, 'runtime', 'node');
mkdirSync(nodeDir, { recursive: true });
run('unzip', [
  '-q',
  '-j',
  '-o',
  nodeZip,
  `node-v${NODE_VERSION}-win-x64/node.exe`,
  `node-v${NODE_VERSION}-win-x64/LICENSE`,
  '-d',
  nodeDir,
]);

console.log('• PostgreSQL for Windows');
const pgCache = path.join(cache, 'pg');
if (!existsSync(path.join(pgCache, 'package', 'native', 'bin', 'postgres.exe'))) {
  rmSync(pgCache, { recursive: true, force: true });
  mkdirSync(pgCache, { recursive: true });
  const tgz = execFileSync('npm', ['pack', PG_PACKAGE, '--silent'], {
    cwd: pgCache,
    encoding: 'utf8',
  }).trim();
  run('tar', ['xzf', tgz], { cwd: pgCache });
}
const pgDir = path.join(stage, 'runtime', 'pgsql');
cpSync(path.join(pgCache, 'package', 'native'), pgDir, { recursive: true });
// pgAdmin's GUI libraries ride along in that build; PostgreSQL itself doesn't use them.
for (const f of execFileSync('ls', [path.join(pgDir, 'bin')], { encoding: 'utf8' }).split('\n'))
  if (/^wx.*\.dll$/.test(f)) rmSync(path.join(pgDir, 'bin', f));
cpSync(path.join(pgCache, 'package', 'LICENSE.md'), path.join(pgDir, 'LICENSE.md'));

console.log('• Windows scripts and icon');
cpSync(path.join(root, 'deploy/windows/tools'), path.join(stage, 'tools'), { recursive: true });
// The shortcut icon: the site's own mark as a PNG inside an .ico (Windows Vista and later).
const sharp = createRequire(path.join(root, 'apps/api/package.json'))('sharp');
const png = await sharp(path.join(root, 'apps/web/public/favicon.svg'), { density: 600 })
  .resize(256, 256)
  .png()
  .toBuffer();
const ico = Buffer.alloc(22);
ico.writeUInt16LE(1, 2); // type: icon
ico.writeUInt16LE(1, 4); // one image
ico.writeUInt16LE(1, 10); // planes
ico.writeUInt16LE(32, 12); // bits per pixel
ico.writeUInt32LE(png.length, 14);
ico.writeUInt32LE(22, 18); // offset; width and height 0 mean 256
writeFileSync(path.join(stage, 'tools', 'fleethub.ico'), Buffer.concat([ico, png]));

// Windows' path limit is 260 characters: leave room for C:\Users\<name>\AppData\Local\.
const longest = execFileSync('find', ['.', '-type', 'f'], { cwd: stage, encoding: 'utf8' })
  .split('\n')
  .reduce((a, b) => (b.length > a.length ? b : a), '');
if (longest.length > 170) throw new Error(`Path too long for Windows: ${longest}`);

console.log('• Zipping');
// The site goes in an inner zip that the installer unpacks with Windows' own fast tar, so the
// download the user extracts holds only three files.
const files = path.join(out, 'fleethub-files.zip');
const zip = path.join(out, 'FleetHub-Windows.zip');
rmSync(files, { force: true });
rmSync(zip, { force: true });
run('zip', ['-q', '-r', '-9', files, 'FleetHub'], { cwd: out });
const top = path.join(out, 'top', 'Fleet Hub setup');
rmSync(path.join(out, 'top'), { recursive: true, force: true });
mkdirSync(top, { recursive: true });
cpSync(files, path.join(top, 'fleethub-files.zip'));
for (const f of ['Install Fleet Hub.cmd', 'Read me.txt'])
  cpSync(path.join(root, 'deploy/windows', f), path.join(top, f));
run('zip', ['-q', '-r', '-0', zip, 'Fleet Hub setup'], { cwd: path.join(out, 'top') });
console.log(
  `Done: ${path.relative(root, zip)} (longest path inside: ${longest.length} characters)`,
);
