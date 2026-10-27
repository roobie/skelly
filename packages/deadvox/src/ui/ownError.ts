const sameOrigin = (url: string, origin: string): boolean => {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
};

// Browsers hide the details of errors from cross-origin scripts (no error object,
// empty filename), so third-party scripts such as analytics must not stop the game.
export const isOwnError = (event: ErrorEvent | PromiseRejectionEvent, origin: string): boolean => {
  if ('reason' in event) {
    const stack = event.reason instanceof Error ? event.reason.stack : undefined;
    const urls = stack?.match(/https?:\/\/[^\s)]+/g) ?? [];
    return urls.length === 0 || urls.some((url) => sameOrigin(url, origin));
  }
  if (event.filename) {
    return sameOrigin(event.filename, origin);
  }
  return event.error !== null && event.error !== undefined;
};
