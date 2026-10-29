import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = dirname(fileURLToPath(import.meta.url));

/** Module names in each folder, without extension, folded to lower case. */
function collisions(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const seen = new Map<string, string>();
  const out: string[] = [];
  for (const e of entries) {
    if (e.isDirectory()) {
      out.push(...collisions(join(dir, e.name)));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) continue;
    const key = e.name.replace(/\.tsx?$/, '').toLowerCase();
    const other = seen.get(key);
    if (other) out.push(`${join(dir, other)} / ${e.name}`);
    else seen.set(key, e.name);
  }
  return out;
}

describe('file names', () => {
  // macOS and Windows checkouts can't tell `callouts.ts` from `Callouts.tsx` in an import.
  it('has no two modules in a folder whose names differ only by case or extension', () => {
    expect(collisions(SRC)).toEqual([]);
  });
});
