import fs from 'fs';
import path from 'path';

const cov = JSON.parse(fs.readFileSync('coverage/coverage-summary.json', 'utf8'));
const exclude = ['debug-app', 'prompt-lab-app', '.test.ts'];
const files = Object.entries(cov).filter(
  ([k]) => k !== 'total' && !exclude.some((x) => k.includes(x))
);
const zero = files.filter(([, v]) => v.lines.pct === 0);
const byArea = {};

for (const [k, v] of files) {
  const norm = k.replace(/\\/g, '/');
  const idx = norm.indexOf('/src/');
  const rest = idx >= 0 ? norm.slice(idx + 5) : norm;
  const area = rest.split('/')[0] || 'root';
  const s = byArea[area] ?? { files: 0, lines: 0, covered: 0, zero: 0 };
  s.files += 1;
  s.lines += v.lines.total;
  s.covered += v.lines.covered;
  if (v.lines.pct === 0) s.zero += 1;
  byArea[area] = s;
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = full.replace(/\\/g, '/');
    if (rel.includes('debug-app') || rel.includes('prompt-lab-app')) continue;
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(rel);
  }
  return out;
}

const srcFiles = walk('src');
let withTest = 0;
let withoutTest = 0;
const testByArea = {};

for (const f of srcFiles) {
  const area = f.split('/')[1] ?? 'root';
  if (fs.existsSync(f.replace(/\.ts$/, '.test.ts'))) {
    withTest += 1;
    testByArea[area] = (testByArea[area] ?? 0) + 1;
  } else {
    withoutTest += 1;
  }
}

for (const [area, s] of Object.entries(byArea)) {
  s.withTest = testByArea[area] ?? 0;
}

const topZero = zero
  .sort((a, b) => b[1].lines.total - a[1].lines.total)
  .slice(0, 15)
  .map(([k, v]) => ({
    file: k.replace(/\\/g, '/').split('/').slice(-2).join('/'),
    lines: v.lines.total,
  }));

const result = {
  total: cov.total,
  fileCount: files.length,
  zeroCount: zero.length,
  withTest,
  withoutTest,
  byArea,
  topZero,
};

console.log(JSON.stringify(result, null, 2));
