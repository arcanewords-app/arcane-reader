/**
 * In-memory ring buffer of recent log entries for the /debug viewer.
 * Used only in development. Do not enable in production.
 */

const MAX_ENTRIES = 300;

export interface DebugLogEntry {
  time: string;
  level: string;
  msg?: string;
  [key: string]: unknown;
}

const buffer: DebugLogEntry[] = [];
let index = 0;

export function addDebugLogEntry(entry: DebugLogEntry): void {
  const next = index % MAX_ENTRIES;
  buffer[next] = entry;
  index += 1;
}

export function getDebugLogEntries(): DebugLogEntry[] {
  if (index <= MAX_ENTRIES) {
    return [...buffer.slice(0, index)];
  }
  const start = index % MAX_ENTRIES;
  return [...buffer.slice(start), ...buffer.slice(0, start)];
}

export function clearDebugLogEntries(): void {
  buffer.length = 0;
  index = 0;
}
