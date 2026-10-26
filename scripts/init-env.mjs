// Creates .env from .env.example with fresh random secrets. Never overwrites an existing .env.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

if (existsSync('.env')) {
  console.log('.env already exists, leaving it alone.');
  process.exit(0);
}
const secret = () => randomBytes(32).toString('base64');
const env = readFileSync('.env.example', 'utf8')
  .replace(/^SESSION_SECRET=$/m, `SESSION_SECRET=${secret()}`)
  .replace(/^FLEET_CODE_KEY=$/m, `FLEET_CODE_KEY=${secret()}`);
writeFileSync('.env', env);
console.log('Wrote .env with new SESSION_SECRET and FLEET_CODE_KEY.');
