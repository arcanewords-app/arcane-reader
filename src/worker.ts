/**
 * BullMQ Worker entry point.
 * Run with: npm run worker
 * Must set RUN_AS_WORKER before importing chapterWorker (which loads server via runTranslateJob).
 */
import './worker-env.js';
import 'dotenv/config';

console.log('[arcane] Loading BullMQ worker…');
import { startChapterWorkers } from './services/chapterWorker.js';
import { logger } from './logger.js';

function main(): void {
  logger.info({ event: 'worker.started' }, 'BullMQ worker started');
  startChapterWorkers();
}

main();

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing workers');
  const { closeChapterWorkers } = await import('./services/chapterWorker.js');
  await closeChapterWorkers();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing workers');
  const { closeChapterWorkers } = await import('./services/chapterWorker.js');
  await closeChapterWorkers();
  process.exit(0);
});
