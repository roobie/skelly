// Failure-only observations; never turn a failed browser assertion into a pass.
import { readFile } from 'node:fs/promises';
import process from 'node:process';

/**
 * @import { ChildProcess } from 'node:child_process'
 * @import { Browser, BrowserContext, Page } from 'playwright'
 */

/** @typedef {{ count: number, last: number | null, contextLoss: number[] }} BrowserFailureFrames */
/** @typedef {{ count: number, last: number, simTime: number | undefined, contextLoss: number[] }} BrowserFailureFrame */
/** @typedef {{ event: string, detail: string | undefined, time: string, elapsedMs: number }} PageEvent */

/** @param {string} path */
const text = async (path) => {
  try {
    return (await readFile(path, 'utf8')).trim();
  } catch (error) {
    return { unavailable: String(error) };
  }
};
/** @param {number} pid */
const cgroup = async (pid) => {
  const membership = await text(`/proc/${pid}/cgroup`);
  if (typeof membership !== 'string') {
    return { pid, membership };
  }
  const relative = membership
    .split('\n')
    .find((line) => line.startsWith('0::'))
    ?.slice(3);
  if (relative === undefined) {
    return { pid, membership };
  }
  const root = `/sys/fs/cgroup${relative}`;
  return {
    pid,
    membership,
    current: await text(`${root}/memory.current`),
    high: await text(`${root}/memory.high`),
    max: await text(`${root}/memory.max`),
    events: await text(`${root}/memory.events`),
    pressure: await text(`${root}/memory.pressure`),
  };
};
const whitespace = /\s+/;
/**
 * @param {unknown} value
 * @returns {Record<string, number>}
 */
const counters = (value) =>
  typeof value === 'string'
    ? Object.fromEntries(
        value.split('\n').map((line) => {
          const [key, number] = line.split(whitespace);
          return [key, Number(number)];
        }),
      )
    : {};
/**
 * @param {unknown} value
 * @returns {Record<string, number>}
 */
const pressureTotals = (value) =>
  typeof value === 'string'
    ? Object.fromEntries(
        value.split('\n').map((line) => {
          const [kind] = line.split(' ');
          return [kind, Number(line.split('total=')[1])];
        }),
      )
    : {};
/**
 * @param {unknown} before
 * @param {unknown} after
 */
const delta = (before, after, parse = counters) =>
  Object.fromEntries(Object.entries(parse(after)).map(([key, value]) => [key, value - (parse(before)[key] ?? 0)]));

/**
 * Wraps a page wait so that its failure dumps the page state first.
 * @template {(...args: never[]) => Promise<unknown>} Wait
 * @param {string} method
 * @param {Wait} original
 * @param {(phase: string, error: unknown) => Promise<void>} dump
 * @returns {Wait}
 */
const dumpingOnFailure = (method, original, dump) =>
  /** @type {Wait} */ (
    /** @param {Parameters<Wait>} args */
    async (...args) => {
      try {
        return await original(...args);
      } catch (error) {
        await dump(`${method}: ${String(args[0]).slice(0, 250)}`, error);
        throw error;
      }
    }
  );

/**
 * @param {BrowserContext} context
 * @param {Browser} browser
 * @param {ChildProcess | undefined} child
 */
export async function observeFailures(context, browser, child) {
  const initial = { parent: await cgroup(process.pid), child: child?.pid ? await cgroup(child.pid) : undefined };
  const tails = { stdout: '', stderr: '' };
  for (const stream of /** @type {const} */ (['stdout', 'stderr'])) {
    child?.[stream]?.on('data', (chunk) => {
      tails[stream] = (tails[stream] + chunk.toString()).slice(-16_384);
    });
  }
  let disconnected = false;
  browser.on('disconnected', () => {
    disconnected = true;
  });
  /** @type {WeakMap<Page, BrowserFailureFrame>} */
  const lastFrames = new WeakMap();
  await context.exposeBinding('__reportBrowserFailureFrame', ({ page }, frame) => {
    lastFrames.set(page, frame);
  });
  await context.addInitScript(() => {
    let reportedAt = Number.NEGATIVE_INFINITY;
    globalThis.browserFailureFrames = { count: 0, last: null, contextLoss: [] };
    /** @param {number} time */
    const frame = (time) => {
      globalThis.browserFailureFrames.count += 1;
      globalThis.browserFailureFrames.last = time;
      if (time - reportedAt >= 1000) {
        reportedAt = time;
        // Preserve the last responsive sample even if a later failure cannot evaluate the page.
        globalThis
          .__reportBrowserFailureFrame({
            count: globalThis.browserFailureFrames.count,
            last: time,
            simTime: globalThis.skellySaveTest?.saveState().simSeconds,
            contextLoss: [...globalThis.browserFailureFrames.contextLoss],
          })
          .catch(() => {
            /* Teardown may remove the host binding; observations cannot affect play. */
          });
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    document.addEventListener(
      'webglcontextlost',
      () => {
        const events = globalThis.browserFailureFrames.contextLoss;
        if (events.length < 16) {
          events.push(performance.now());
        }
      },
      true,
    );
  });
  /** @param {Page} page */
  const attach = (page) => {
    const openedAt = Date.now();
    /** @type {PageEvent[]} */
    const events = [];
    /**
     * @param {string} event
     * @param {string} [detail]
     */
    const record = (event, detail) => {
      events.push({ event, detail, time: new Date().toISOString(), elapsedMs: Date.now() - openedAt });
      if (events.length > 64) {
        events.shift();
      }
    };
    page.on('load', () => record('load'));
    page.on('domcontentloaded', () => record('domcontentloaded'));
    page.on('crash', () => record('crash'));
    page.on('close', () => record('close'));
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        record('navigation', frame.url());
      }
    });
    page.on('pageerror', (error) => record('pageerror', String(error)));
    page.on('console', (message) => {
      if (message.type() === 'error') {
        record('console', message.text());
      }
    });
    let dumped = false;
    /**
     * @param {string} phase
     * @param {unknown} error
     */
    const dump = async (phase, error) => {
      if (dumped) {
        return;
      }
      dumped = true;
      /** @type {ReturnType<typeof setTimeout> | undefined} */
      let timer;
      const state = await Promise.race([
        page
          .evaluate(() => {
            const canvases = [...document.querySelectorAll('#view canvas')]
              .filter((canvas) => canvas instanceof HTMLCanvasElement)
              .map((canvas) => ({
                connected: canvas.isConnected,
                width: canvas.width,
                height: canvas.height,
                rect: canvas.getBoundingClientRect().toJSON(),
                display: getComputedStyle(canvas).display,
                visibility: getComputedStyle(canvas).visibility,
              }));
            let canvasState = 'absent';
            if (canvases.length > 0) {
              const visible = canvases.some(
                (canvas) =>
                  canvas.connected &&
                  canvas.rect.width > 0 &&
                  canvas.rect.height > 0 &&
                  canvas.display !== 'none' &&
                  canvas.visibility !== 'hidden',
              );
              canvasState = visible ? 'visible' : 'hidden-or-zero-size';
            }
            const overlay = document.querySelector('#overlay');
            return {
              url: location.href,
              viewport: [innerWidth, innerHeight],
              ready: document.readyState,
              focus: document.hasFocus(),
              visibility: document.visibilityState,
              title: document.title,
              status: document.querySelector('#save-status')?.textContent,
              errors: document.querySelector('#errors')?.textContent,
              overlayHidden: overlay instanceof HTMLElement ? overlay.hidden : undefined,
              canvasState,
              canvases,
              frames: globalThis.browserFailureFrames,
              simTime: globalThis.skellySaveTest?.saveState().simSeconds,
            };
          })
          .catch((failure) => ({ evaluationError: String(failure) })),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve({ canvasState: 'unresponsive', evaluationTimeoutMs: 5000 }), 5000);
        }),
      ]);
      clearTimeout(timer);
      /** @type {ReturnType<typeof setTimeout> | undefined} */
      let diagnosticTimer;
      const saveDiagnostics = await Promise.race([
        page
          .evaluate(async () => {
            /**
             * @template T
             * @param {() => Promise<T>} read
             */
            const capture = async (read) => {
              try {
                return await read();
              } catch (failure) {
                return { error: String(failure) };
              }
            };
            const storage = globalThis.skellySaveTest?.storage;
            const [databases, namespaces, estimate] = await Promise.all([
              capture(() => indexedDB.databases()),
              capture(() => {
                if (!storage) {
                  throw new Error('save storage unavailable');
                }
                return storage.listNamespaces();
              }),
              capture(() => navigator.storage.estimate()),
            ]);
            return {
              indexedDbDatabases: databases,
              saveNamespaces: namespaces,
              storageEstimate: estimate,
              generationBeforeReload: sessionStorage.getItem('lifecycle-generation-before-reload'),
              lifecyclePagehide: sessionStorage.getItem('lifecycle-pagehide'),
              lifecycleWriterTrigger: sessionStorage.getItem('lifecycle-writer-trigger'),
            };
          })
          .catch((failure) => ({ evaluationError: String(failure) })),
        new Promise((resolve) => {
          diagnosticTimer = setTimeout(() => resolve({ timeoutMs: 3000 }), 3000);
        }),
      ]);
      clearTimeout(diagnosticTimer);
      const current = { parent: await cgroup(process.pid), child: child?.pid ? await cgroup(child.pid) : undefined };
      process.stderr.write(
        `BROWSER_FAILURE ${JSON.stringify({
          phase,
          error: String(error),
          events,
          state,
          saveDiagnostics,
          lastResponsiveFrame: lastFrames.get(page),
          browser: {
            connected: browser.isConnected(),
            disconnected,
            pid: child?.pid,
            exitCode: child?.exitCode,
            signalCode: child?.signalCode,
            ...tails,
          },
          cgroups: {
            initial,
            current,
            parentEventsDelta: delta(initial.parent.events, current.parent.events),
            childEventsDelta: delta(initial.child?.events, current.child?.events),
            parentPressureDeltaUs: delta(initial.parent.pressure, current.parent.pressure, pressureTotals),
            childPressureDeltaUs: delta(initial.child?.pressure, current.child?.pressure, pressureTotals),
          },
        })}\n`,
      );
    };
    page.waitForSelector = dumpingOnFailure('waitForSelector', page.waitForSelector.bind(page), dump);
    page.waitForFunction = dumpingOnFailure('waitForFunction', page.waitForFunction.bind(page), dump);
    return dump;
  };
  context.on('page', attach);
  for (const page of context.pages()) {
    attach(page);
  }
}
