import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma skips its own .env loading when a config file exists, so load the repo-root .env here.
try {
  process.loadEnvFile(path.resolve(import.meta.dirname, '../../.env'));
} catch {
  // No .env (CI or production): rely on the real environment.
}

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
});
