import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');

/** Load a JSON fixture from `tests/contracts/fixtures/`. */
export function loadFixture(name: string): unknown {
  const file = name.endsWith('.json') ? name : `${name}.json`;
  const raw = readFileSync(join(fixturesDir, file), 'utf8');
  return JSON.parse(raw) as unknown;
}
