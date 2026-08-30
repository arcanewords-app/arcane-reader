/** Local E2E origins. API is Express; UI is Vite (proxies /api). */

export const UI_ORIGIN = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
export const API_ORIGIN = process.env.E2E_API_URL ?? 'http://localhost:3000';

export const STAMP_HINT =
  'Local E2E needs the Docker stamp and the app running.\n' +
  '  npm run stack:up          # restores arcane-reader-stamp:latest if present\n' +
  '  npm run stack:restore     # if the stamp is dirty\n' +
  '  npm run dev\n' +
  'Then retry: npm run test:e2e';

export function stampFailed(detail: string): Error {
  return new Error(`${detail}\n${STAMP_HINT}`);
}
