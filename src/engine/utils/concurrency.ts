/**
 * Run async tasks with limited concurrency.
 */

/**
 * Run items through fn with at most `limit` concurrent executions.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  if (limit < 1) limit = 1;

  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      const item = items[index]!;
      results[index] = await fn(item, index);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export interface ResilientResult<R> {
  success: boolean;
  data?: R;
  error?: string;
}

/**
 * Run items through fn with limited concurrency. Catches errors per task and returns
 * ResilientResult[] instead of throwing. One failed task does not abort the batch.
 * Re-throws immediately when isCancelled() returns true or when fn throws "Cancelled".
 */
export async function runWithConcurrencyResilient<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  options?: {
    isCancelled?: () => boolean;
    onItemComplete?: (index: number, result: ResilientResult<R>) => void;
  }
): Promise<ResilientResult<R>[]> {
  if (items.length === 0) return [];
  if (limit < 1) limit = 1;

  const results: ResilientResult<R>[] = new Array(items.length);
  let nextIndex = 0;
  const isCancelled = options?.isCancelled;
  const onItemComplete = options?.onItemComplete;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      if (isCancelled?.()) throw new Error('Cancelled');
      const index = nextIndex++;
      const item = items[index]!;
      try {
        const data = await fn(item, index);
        const result: ResilientResult<R> = { success: true, data };
        results[index] = result;
        onItemComplete?.(index, result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'Cancelled') {
          throw err;
        }
        const result: ResilientResult<R> = { success: false, error: msg };
        results[index] = result;
        onItemComplete?.(index, result);
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
