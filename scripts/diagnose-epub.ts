/**
 * EPUB diagnostic script.
 * Run: npx tsx scripts/diagnose-epub.ts "path/to/file.epub"
 */

import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { parseEpubLazy } from '../src/services/import/epub.js';

const path = process.argv[2];
if (!path) {
  console.error('Usage: npx tsx scripts/diagnose-epub.ts <path-to-epub-or-folder>');
  process.exit(1);
}

function isZipHeader(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05);
}

function findEpubInDir(dirPath: string): string | null {
  try {
    const { readdirSync } = require('fs');
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dirPath, e.name);
      if (e.isFile() && e.name.toLowerCase().endsWith('.epub')) return full;
    }
    for (const e of entries) {
      const full = join(dirPath, e.name);
      if (e.isFile()) {
        try {
          const buf = readFileSync(full, { start: 0, end: 4 });
          if (isZipHeader(buf)) return full;
        } catch {
          /* skip */
        }
      } else if (e.isDirectory()) {
        const found = findEpubInDir(full);
        if (found) return found;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function main() {
  console.log('=== EPUB Diagnostic (Arcane Reader parser) ===\n');
  console.log('Path:', path);

  if (!existsSync(path)) {
    console.error('\nERROR: Path does not exist.');
    process.exit(1);
  }

  const stat = statSync(path);
  let targetPath = path;
  let buffer: Buffer;

  if (stat.isDirectory()) {
    console.log('Type: directory');
    const epubPath = findEpubInDir(path);
    if (!epubPath) {
      console.error('\nERROR: No .epub file found.');
      process.exit(1);
    }
    targetPath = epubPath;
    buffer = readFileSync(epubPath);
  } else {
    console.log('Type: file');
    buffer = readFileSync(path);
  }

  console.log('Size:', buffer.length, 'bytes');
  if (!isZipHeader(buffer)) {
    console.error('\nERROR: Not a valid ZIP/EPUB.');
    process.exit(1);
  }
  console.log('ZIP signature: OK');

  console.log('\n--- Parsing with parseEpubLazy ---');
  try {
    const result = await parseEpubLazy(buffer);
    console.log('Title:', result.metadata.title ?? '(none)');
    console.log('Chapter count:', result.chapterCount);
    console.log('Warnings:', result.warnings.length ? result.warnings : '(none)');
    console.log('Errors:', result.errors.length ? result.errors : '(none)');

    if (result.chapterCount > 0) {
      let count = 0;
      for await (const ch of result.chapterIterator) {
        count++;
        if (count === 1) {
          console.log('\nFirst chapter:', ch.title);
          console.log('First chapter content length:', ch.content.length, 'chars');
        }
      }
      console.log('\nTotal chapters read:', count);
    }
    console.log('\n=== Done ===');
  } catch (err) {
    console.error('\nParse ERROR:', err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) console.error(err.stack);
    process.exit(1);
  }
}

main();
