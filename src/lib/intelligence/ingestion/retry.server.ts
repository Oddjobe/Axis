export interface RetryOptions {
  attempts?: number;
  timeoutMs?: number;
  delayMs?: number;
  deadlineAt?: number;
  signal?: AbortSignal;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function abortReason(signal: AbortSignal, fallback: string): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error(signal.reason ? String(signal.reason) : fallback);
}

async function abortableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal!, "Retry delay aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function remainingBudget(deadlineAt: number | undefined): number {
  return deadlineAt === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(0, deadlineAt - Date.now());
}

export async function withBoundedRetry<T>(
  label: string,
  operation: (
    attempt: number,
    timeoutMs: number,
    signal: AbortSignal,
  ) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 2);
  const timeoutMs = Math.max(1, options.timeoutMs ?? 30_000);
  const delayMs = Math.max(0, options.delayMs ?? 250);
  const errors: string[] = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    options.signal?.throwIfAborted();
    const remainingMs = remainingBudget(options.deadlineAt);
    if (remainingMs <= 0) {
      errors.push(`attempt ${attempt}: run deadline exhausted`);
      break;
    }
    const attemptTimeoutMs = Math.max(1, Math.min(timeoutMs, remainingMs));
    const attemptController = new AbortController();
    const onRunAbort = () =>
      attemptController.abort(
        abortReason(options.signal!, `${label} run aborted`),
      );
    options.signal?.addEventListener("abort", onRunAbort, { once: true });
    const timer = setTimeout(
      () =>
        attemptController.abort(
          new Error(`${label} timed out after ${attemptTimeoutMs}ms`),
        ),
      attemptTimeoutMs,
    );
    try {
      return await operation(
        attempt,
        attemptTimeoutMs,
        attemptController.signal,
      );
    } catch (error) {
      if (options.signal?.aborted) {
        throw abortReason(options.signal, `${label} run aborted`);
      }
      const failure = attemptController.signal.aborted
        ? abortReason(attemptController.signal, `${label} attempt aborted`)
        : error;
      errors.push(`attempt ${attempt}: ${messageOf(failure)}`);
      if (attempt < attempts && delayMs > 0) {
        const delay = delayMs * attempt;
        if (remainingBudget(options.deadlineAt) <= delay) break;
        await abortableDelay(delay, options.signal);
      }
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onRunAbort);
    }
  }
  throw new Error(`${label} failed (${errors.join("; ")})`);
}

export async function fetchWithBoundedRetry<T>(
  label: string,
  url: string,
  init: RequestInit = {},
  consume: (response: Response, signal: AbortSignal) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  return withBoundedRetry(
    label,
    async (_attempt, _attemptTimeoutMs, signal) => {
      const response = await fetch(url, { ...init, signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      return consume(response, signal);
    },
    { ...options, timeoutMs },
  );
}
