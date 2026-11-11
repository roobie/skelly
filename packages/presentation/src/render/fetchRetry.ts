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

/**
 * Whether a failed load is worth another try: a 5xx response or a network failure. three's
 * FileLoader throws an error carrying the `response` for a bad status, and fetch itself throws
 * a TypeError for a network failure; anything else (4xx, a file that doesn't parse) won't change.
 */
export const isPassingFailure = (error: unknown): boolean => {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === 'number' ? status >= 500 : error instanceof TypeError;
};

/** `load` that tries again after a passing failure, `wait`ing between tries; the last error reaches `onError`. */
export const retrying =
  <T>(load: LoadWith<T>, retry: FetchRetry, wait: (seconds: number, then: () => void) => void): LoadWith<T> =>
  (url, onLoad, onError) => {
    const attempt = (retriesLeft: number, backoffRealSeconds: number): void => {
      load(url, onLoad, (error) => {
        if (retriesLeft > 0 && isPassingFailure(error)) {
          wait(backoffRealSeconds, () => attempt(retriesLeft - 1, backoffRealSeconds * 2));
        } else {
          onError(error);
        }
      });
    };
    attempt(retry.retries, retry.backoffRealSeconds);
  };
