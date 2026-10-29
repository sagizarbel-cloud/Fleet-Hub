// First run on a new server: `node dist/create-admin.js --email <email> --name <name>`.
// Adds the base lists and the first admin, then prints a one-time link to choose a password.
import { parseArgs } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { userBody } from '@fleet-hub/shared';
import { firstRun } from './lib/first-run';

const { values } = parseArgs({ options: { email: { type: 'string' }, name: { type: 'string' } } });
const input = userBody.pick({ email: true, name: true }).safeParse(values);
const origin = process.env.APP_ORIGIN;
if (!input.success || !origin) {
  console.error(
    'Usage: node dist/create-admin.js --email <email> --name <name>  (needs APP_ORIGIN)',
  );
  process.exit(2);
}

const db = new PrismaClient();
try {
  const result = await firstRun(db, input.data);
  if (!result.ok) {
    console.error(
      result.reason === 'admin_exists'
        ? 'An admin already exists. Add users from Settings → Users instead.'
        : 'That email belongs to a user who is not an admin. Use another email.',
    );
    process.exitCode = 1;
  } else {
    console.log(result.created ? 'Admin created.' : 'Admin already exists: issued a new link.');
    console.log(
      `Open this link to choose a password (one use, until ${result.expiresAt.toISOString()}):`,
    );
    console.log(`${origin}${result.path}`);
  }
} finally {
  await db.$disconnect();
}
