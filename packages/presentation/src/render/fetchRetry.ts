// Passing host errors (a 503 from the static host) are common on the public site, and one lost
// model stays lost for the session, so a model's fetch is retried before it is reported.

/** Content tunables (`packages/engine/src/core/schema/graphics.ts`, `modelFetchRetry`). */
export interface FetchRetry {
  /** Further tries after the first one fails. */
  readonly retries: number;
  /** Wait before the first retry; each later wait doubles. */
  readonly backoffRealSeconds: number;
}

/** A loader's `load`: the shape three's loaders share, reduced to what a retry needs. */
export type LoadWith<T> = (url: string, onLoad: (value: T) => void, onError: (error: unknown) => void) => void;

/** Stops what was started: a pending wait, and any callback that arrives afterwards. */
export type Cancel = () => void;

/** Runs `then` after `seconds` and returns what stops it. */
export type Schedule = (seconds: number, then: () => void) => Cancel;

// GLTFLoader reports a failed fetch and a failed parse through one callback. The parse stage tags
// its errors, so the retry can tell a deterministic failure from a transport one.
const parseFailures = new WeakSet<object>();

/** Marks an error as a parse failure, which a retry won't change; returns it. */
export const asParseFailure = (error: unknown): unknown => {
  if (typeof error === 'object' && error !== null) {
    parseFailures.add(error);
  }
  return error;
};

/**
 * Whether a failed load is worth another try: a 5xx response or a network failure. three's
 * FileLoader throws an error carrying the `response` for a bad status, and fetch itself throws
 * a TypeError for a network failure; anything else (4xx, a file that doesn't parse) won't change.
 */
export const isPassingFailure = (error: unknown): boolean => {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  if (typeof status === 'number') {
    return status >= 500;
  }
  return error instanceof TypeError && !parseFailures.has(error);
};

/**
 * `load` that tries again after a passing failure, waiting on `schedule` between tries; the last
 * error reaches `onError`. Calling the returned `Cancel` drops the pending wait and every later callback.
 */
export const retrying =
  <T>(load: LoadWith<T>, retry: FetchRetry, schedule: Schedule) =>
  (url: string, onLoad: (value: T) => void, onError: (error: unknown) => void): Cancel => {
    let cancelled = false;
    let cancelWait: Cancel | undefined;
    const attempt = (retriesLeft: number, backoffRealSeconds: number): void => {
      load(
        url,
        (value) => {
          if (!cancelled) {
            onLoad(value);
          }
        },
        (error) => {
          if (cancelled) {
            return;
          }
          if (retriesLeft > 0 && isPassingFailure(error)) {
            cancelWait = schedule(backoffRealSeconds, () => attempt(retriesLeft - 1, backoffRealSeconds * 2));
          } else {
            onError(error);
          }
        },
      );
    };
    attempt(retry.retries, retry.backoffRealSeconds);
    return () => {
      cancelled = true;
      cancelWait?.();
    };
  };
