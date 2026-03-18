/**
 * Must be imported first by worker.ts so RUN_AS_WORKER is set before server is loaded.
 * Prevents server from starting when worker imports performTranslation from server.
 */
process.env.RUN_AS_WORKER = '1';
