import { AsyncLocalStorage } from 'node:async_hooks';

const editionTarget = new AsyncLocalStorage<string>();

/** Non-primary target language for the current translate/save async tree. */
export function currentEditionTarget(): string | undefined {
  return editionTarget.getStore();
}

export function runWithEditionTarget<T>(targetLanguage: string, fn: () => Promise<T>): Promise<T> {
  return editionTarget.run(targetLanguage, fn);
}
