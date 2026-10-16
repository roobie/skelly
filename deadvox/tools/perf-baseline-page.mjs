/** Console errors include shader failures that do not raise pageerror. */
export function watchPageErrors(page, onError) {
  page.on('console', (message) => {
    if (message.type() === 'error') {
      onError(new Error(message.text()));
    }
  });
  page.on('pageerror', onError);
}
