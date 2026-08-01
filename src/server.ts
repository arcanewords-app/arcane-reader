/**
 * Arcane Reader - Web server for novel translation UI
 *
 * Integrated with:
 * - Supabase PostgreSQL for persistent storage
 * - OpenAI for translation
 */

import { createApp } from './createApp.js';
import { logger } from './logger.js';
import { serviceHealthManager } from './services/serviceHealth.js';
import { isBullAvailable } from './services/chapterQueue.js';
import { importBridgedLogEntry } from './debug/buffer.js';
import { importBridgedLlmCapture } from './debug/promptCapture.js';
import { importBridgedHttpExchange } from './debug/httpCapture.js';
import { hydrateDebugBuffersFromDisk } from './debug/hydrate.js';

export { performTranslation } from './api/chapterTranslation.js';
export { createApp } from './createApp.js';

console.log('[arcane] API modules loaded, registering routes…');

const { app, port: PORT, config } = createApp();

// Export app for Vercel (when imported as module)
export default app;

async function startServer(): Promise<void> {
  console.log(`[arcane] Starting HTTP server on port ${PORT}…`);
  const httpServer = app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║     █████╗ ██████╗  ██████╗ █████╗ ███╗   ██╗███████╗     ║
║    ██╔══██╗██╔══██╗██╔════╝██╔══██╗████╗  ██║██╔════╝     ║
║    ███████║██████╔╝██║     ███████║██╔██╗ ██║█████╗       ║
║    ██╔══██║██╔══██╗██║     ██╔══██║██║╚██╗██║██╔══╝       ║
║    ██║  ██║██║  ██║╚██████╗██║  ██║██║ ╚████║███████╗     ║
║    ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝     ║
║                                                           ║
║                  Переводчик новелл                        ║
║                                                           ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║   🌐 Сервер: http://localhost:${PORT}                        ║
║   💾 База данных: Supabase PostgreSQL                      ║
║   🤖 AI: ${config.openai.apiKey ? 'OpenAI ✅' : 'Не настроен ⚠️'}                                   ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);
    logger.info(
      {
        event: 'server.started',
        port: PORT,
        hasOpenAI: !!config.openai.apiKey,
      },
      `Server listening on http://localhost:${PORT}`
    );
    const hasJobStoreRedis =
      (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) &&
      (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN);
    if (isBullAvailable() && !hasJobStoreRedis) {
      logger.warn(
        'REDIS_URL is set but KV_REST_API_URL/KV_REST_API_TOKEN are not. ' +
          'Job cancellation will not work across server/worker. Set Upstash REST credentials for job stores.'
      );
    }
    serviceHealthManager.startPeriodicChecks(30_000);
    if (process.env.NODE_ENV !== 'production') {
      hydrateDebugBuffersFromDisk();
      void import('./debug/redisBridge.js').then(({ startDebugBridgeSubscriber }) =>
        startDebugBridgeSubscriber({
          onLog: importBridgedLogEntry,
          onLlm: importBridgedLlmCapture,
          onHttp: importBridgedHttpExchange,
        })
      );
    }
  });

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `\n[arcane] Port ${PORT} is already in use. Stop the other process or run: npm run kill-port\n`
      );
      process.exit(1);
    }
    throw err;
  });
}

if (!process.env.VERCEL && !process.env.RUN_AS_WORKER) {
  startServer().catch((err) => logger.error({ err }, 'Server failed to start'));
}
