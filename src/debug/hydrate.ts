/**
 * Hydrate in-memory debug buffers from JSONL persistence on API startup.
 */

import { readPersistRecords, shouldHydrateOnStart } from './persist.js';
import { hydrateLogEntry } from './buffer.js';
import { hydrateLlmCapture } from './promptCapture.js';
import { hydrateHttpExchange } from './httpCapture.js';
import type { DebugLogEntry } from './buffer.js';
import type { CapturedLlmCall } from './promptCapture.js';
import type { CapturedHttpExchange } from './httpCapture.js';

export function hydrateDebugBuffersFromDisk(): void {
  if (!shouldHydrateOnStart()) return;
  const records = readPersistRecords();
  for (const record of records) {
    if (record.kind === 'log') {
      hydrateLogEntry(record.payload as DebugLogEntry);
    } else if (record.kind === 'llm') {
      hydrateLlmCapture(record.payload as CapturedLlmCall);
    } else if (record.kind === 'http') {
      hydrateHttpExchange(record.payload as CapturedHttpExchange);
    }
  }
}
