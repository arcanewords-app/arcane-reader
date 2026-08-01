/**
 * Vitest setup for component / hook suites (happy-dom).
 * Cleans up Testing Library after each test.
 * Do not import react-i18next here — Node resolution of `react` breaks without
 * Vite transforming that graph; tests that need i18n import `../client/i18n.js`
 * after aliases apply, or mock `react-i18next`.
 */

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/preact';

afterEach(() => {
  cleanup();
});
