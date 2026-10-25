import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

/**
 * Brings the throwaway test database (DATABASE_URL_TEST) up to the current migrations,
 * then empties its tables so every run starts clean.
 */
export default async function setup() {
  try {
    process.loadEnvFile(path.resolve(import.meta.dirname, '../../../.env'));
  } catch {
    // CI provides the environment directly.
  }
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error('DATABASE_URL_TEST is not set');
  if (url === process.env.DATABASE_URL)
    throw new Error('DATABASE_URL_TEST must differ from DATABASE_URL');
  if (!/_test(\?|$)/.test(url))
    throw new Error('DATABASE_URL_TEST must name a database ending in _test');

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  const db = new PrismaClient({ datasourceUrl: url });
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(
    `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`,
  );
  await db.$disconnect();
}
