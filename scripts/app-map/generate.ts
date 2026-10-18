import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAppMap } from './extract.js';
import { renderHtml } from './html.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = join(root, 'docs/01-reference/app-map');
const map = buildAppMap(root);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'app-map.json'), `${JSON.stringify(map, null, 2)}\n`);
writeFileSync(join(outDir, 'index.html'), renderHtml(map));

if (map.warnings.length > 0) {
  console.error(`app-map: ${map.warnings.length} warnings`);
  for (const warning of map.warnings) console.error(`  ${warning}`);
} else {
  console.log('app-map: no warnings');
}
console.log(`screens ${map.screens.length}, endpoints ${map.endpoints.length}`);
