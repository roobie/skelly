// Failure-only observations of save startup and Web Lock state; never turn a failed assertion into a pass.
// A bare "#go never enabled" or "win checkpoint never saved" timeout cannot tell a stalled discovery or write
// from a missing launcher, so a stalled step records what the save lock and the status line were doing (#670, #749).

/** Records every `#save-status` text change with a page-clock timestamp, from the first document. */
export const installSaveStatusTrace = () => {
  const trace = [];
  globalThis.saveStatusTrace = trace;
  const note = (text) => {
    if (trace.at(-1)?.text !== text) {
      trace.push({ at: Math.round(performance.now()), text });
    }
  };
  const watch = () => {
    const status = document.querySelector('#save-status');
    if (!status) {
      return false;
    }
    note(status.textContent);
    new MutationObserver(() => note(status.textContent)).observe(status, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return true;
  };
  if (!watch()) {
    new MutationObserver((_records, observer) => {
      if (watch()) {
        observer.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  }
};

/** The Web Lock queue as the page sees it, and the status transitions so far. */
export const saveLockSnapshot = (page) =>
  page
    .evaluate(async () => ({
      at: Math.round(performance.now()),
      visibility: document.visibilityState,
      statusTrace: globalThis.saveStatusTrace ?? null,
      locks: await navigator.locks.query().then(({ held = [], pending = [] }) => ({
        held: held.map(({ name, mode, clientId }) => ({ name, mode, clientId })),
        pending: pending.map(({ name, mode, clientId }) => ({ name, mode, clientId })),
      })),
    }))
    .catch((error) => ({ unreadable: error instanceof Error ? error.message : String(error) }));
