/**
 * Smoke test: ship one log line to Axiom (staging dataset).
 * Usage: NODE_ENV=production LOG_SHIPPING=1 AXIOM_DATASET=arcane-staging tsx scripts/smoke-axiom-logger.ts
 * Requires AXIOM_TOKEN in .env or environment.
 */
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

process.env.NODE_ENV = 'production';
process.env.LOG_SHIPPING = process.env.LOG_SHIPPING ?? '1';
process.env.AXIOM_DATASET = process.env.AXIOM_DATASET ?? 'arcane-staging';

if (!process.env.AXIOM_TOKEN?.trim()) {
  console.error('AXIOM_TOKEN is required for smoke test');
  process.exit(1);
}

const { logger, flushLogs, getLoggingStatus } = await import('../src/logger.js');

const status = getLoggingStatus();
console.log('Logging status:', JSON.stringify(status));

logger.info({ event: 'smoke.test', source: 'scripts/smoke-axiom-logger.ts' }, 'Axiom smoke test');

await flushLogs();
console.log('Flush complete — check arcane-staging Live tail for event=smoke.test');
