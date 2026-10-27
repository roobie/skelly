// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installErrorReportHandler, setErrorReportContext } from '../src/ui/errorReport.ts';
import { isOwnError } from '../src/ui/ownError.ts';

const OWN = 'https://game.example';
const FOREIGN_SCRIPT = 'https://analytics.example/beacon.js';

const errorEvent = (init: { error?: unknown; message?: string; filename?: string }): ErrorEvent =>
  Object.assign(new Event('error'), { message: '', filename: '', error: undefined, ...init }) as ErrorEvent;

const rejection = (reason: unknown): PromiseRejectionEvent =>
  Object.assign(new Event('unhandledrejection'), { reason }) as PromiseRejectionEvent;

describe('the game owns an error', () => {
  it('rejects a sanitized cross-origin "Script error." with no error object', () => {
    expect(isOwnError(errorEvent({ message: 'Script error.' }), OWN)).toBe(false);
  });

  it('rejects an error raised by a script from another origin, even with an error object', () => {
    expect(isOwnError(errorEvent({ error: new Error('x'), filename: FOREIGN_SCRIPT }), OWN)).toBe(false);
  });

  it('accepts an Error thrown by a script from the game origin', () => {
    expect(isOwnError(errorEvent({ error: new Error('x'), filename: `${OWN}/assets/main.js` }), OWN)).toBe(true);
  });

  it('accepts an Error with no filename', () => {
    expect(isOwnError(errorEvent({ error: new Error('x') }), OWN)).toBe(true);
  });

  it('rejects a rejection whose stack names only foreign scripts', () => {
    const reason = new Error('x');
    reason.stack = `Error: x\n    at beacon (${FOREIGN_SCRIPT}:1:1)`;
    expect(isOwnError(rejection(reason), OWN)).toBe(false);
  });

  it('accepts a rejection whose stack names a game script', () => {
    const reason = new Error('x');
    reason.stack = `Error: x\n    at f (${OWN}/assets/main.js:1:1)\n    at g (${FOREIGN_SCRIPT}:1:1)`;
    expect(isOwnError(rejection(reason), OWN)).toBe(true);
  });
});

describe('error panel listeners', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays hidden and keeps the game running for a foreign error, then shows an own one', () => {
    document.body.innerHTML = `
      <main id="app"></main>
      <a id="playtest-feedback" href="https://github.com/roobie/skelly/issues/new"></a>
      <section id="error-report" hidden>
        <h2 id="error-report-title" tabindex="-1"></h2>
        <pre data-error-text></pre>
        <button data-error-copy></button><button data-error-download></button>
        <a data-error-download-link></a><a data-error-feedback></a><p data-error-status></p>
      </section>`;
    const stop = vi.fn();
    setErrorReportContext({ seed: 1, site: 's', clockText: () => '', stop });
    installErrorReportHandler();
    const panel = document.getElementById('error-report')!;

    globalThis.dispatchEvent(errorEvent({ message: 'Script error.' }));
    expect(panel.hidden).toBe(true);
    expect(stop).not.toHaveBeenCalled();

    globalThis.dispatchEvent(errorEvent({ error: new Error('own failure'), filename: `${location.origin}/a.js` }));
    expect(panel.hidden).toBe(false);
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
