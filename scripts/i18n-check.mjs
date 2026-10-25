// Fails when a translation key is missing or empty in either language.
import { readFileSync } from 'node:fs';

const load = (lang) => JSON.parse(readFileSync(`apps/web/src/i18n/${lang}.json`, 'utf8'));

function flatten(obj, prefix = '', out = {}) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object') flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

const en = flatten(load('en'));
const he = flatten(load('he'));
const problems = [];
for (const key of Object.keys(en)) {
  if (!(key in he)) problems.push(`missing in he: ${key}`);
  else if (typeof he[key] !== 'string' || he[key].trim() === '')
    problems.push(`empty in he: ${key}`);
}
for (const key of Object.keys(he)) {
  if (!(key in en)) problems.push(`missing in en: ${key}`);
  else if (typeof en[key] !== 'string' || en[key].trim() === '')
    problems.push(`empty in en: ${key}`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\ni18n:check failed with ${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`i18n:check passed: ${Object.keys(en).length} keys in en and he.`);
