/**
 * The page events the watch listens to; a Playwright page satisfies it.
 * @typedef {object} ErrorSource
 * @property {{
 *   (event: 'console', listener: (message: { type(): string; text(): string }) => void): unknown;
 *   (event: 'pageerror', listener: (error: Error) => void): unknown;
 * }} on
 */

/**
 * Console errors include shader failures that do not raise pageerror.
 * @param {ErrorSource} page
 * @param {(error: Error) => void} onError
 */
export function watchPageErrors(page, onError) {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      onError(new Error(message.text()));
    }
  });
  page.on('pageerror', onError);
}
