// Static ARM64 check: the native pieces the api needs on the Ubuntu ARM server exist for arm64.
// The full check (install + load inside an arm64 container) is `pnpm docker:arm64`, which needs
// an ARM machine or QEMU emulation.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.resolve('apps/api/package.json'));
const failures = [];

// 1. Prisma generated an arm64 query engine (binaryTargets in schema.prisma).
const clientDir = path.dirname(
  require.resolve('.prisma/client/package.json', {
    paths: [path.dirname(require.resolve('@prisma/client'))],
  }),
);
const engine = readdirSync(clientDir).find((f) => f.includes('linux-arm64') && f.endsWith('.node'));
if (!engine) {
  failures.push('Prisma: no linux-arm64 query engine generated (check binaryTargets).');
} else {
  // ELF e_machine at offset 18: 0xB7 = AArch64.
  const machine = readFileSync(path.join(clientDir, engine)).readUInt16LE(18);
  if (machine !== 0xb7) failures.push(`Prisma: ${engine} is not an AArch64 binary.`);
  else console.log(`ok  Prisma engine ${engine} (AArch64)`);
}

// 2. argon2 ships a prebuilt linux-arm64 binary.
const argonPkg = JSON.parse(readFileSync(require.resolve('@node-rs/argon2/package.json'), 'utf8'));
if (!argonPkg.optionalDependencies?.['@node-rs/argon2-linux-arm64-gnu']) {
  failures.push('argon2: no @node-rs/argon2-linux-arm64-gnu prebuilt listed.');
} else {
  console.log(`ok  @node-rs/argon2 ${argonPkg.version} lists a linux-arm64-gnu prebuilt`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
