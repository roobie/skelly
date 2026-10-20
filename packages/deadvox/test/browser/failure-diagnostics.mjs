// Failure-only observations; never turn a failed browser assertion into a pass.
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const text = async (path) => {
  try {
    return (await readFile(path, 'utf8')).trim();
  } catch (error) {
    return { unavailable: String(error) };
  }
};
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
const counters = (value) =>
  typeof value === 'string'
    ? Object.fromEntries(
        value.split('\n').map((line) => {
          const [key, number] = line.split(whitespace);
          return [key, Number(number)];
        }),
      )
    : {};
const pressureTotals = (value) =>
  typeof value === 'string'
    ? Object.fromEntries(
        value.split('\n').map((line) => {
          const [kind] = line.split(' ');
          return [kind, Number(line.split('total=')[1])];
        }),
      )
    : {};
const delta = (before, after, parse = counters) =>
  Object.fromEntries(Object.entries(parse(after)).map(([key, value]) => [key, value - (parse(before)[key] ?? 0)]));

export async function observeFailures(context, browser, child) {
  const initial = { parent: await cgroup(process.pid), child: child?.pid ? await cgroup(child.pid) : undefined };
  const tails = { stdout: '', stderr: '' };
  for (const stream of ['stdout', 'stderr']) {
    child?.[stream]?.on('data', (chunk) => {
      tails[stream] = (tails[stream] + chunk.toString()).slice(-16_384);
    });
  }
  let disconnected = false;
  browser.on('disconnected', () => {
    disconnected = true;
  });
  const lastFrames = new WeakMap();
  await context.exposeBinding('__reportBrowserFailureFrame', ({ page }, frame) => {
    lastFrames.set(page, frame);
  });
  await context.addInitScript(() => {
    let reportedAt = Number.NEGATIVE_INFINITY;
    globalThis.browserFailureFrames = { count: 0, last: null, contextLoss: [] };
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
            simTime: globalThis.deadvoxSaveTest?.controller?.simTime?.(),
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
  const attach = (page) => {
    const openedAt = Date.now();
    const events = [];
    const record = (event, detail) => {
      events.push({ event, detail, time: new Date().toISOString(), elapsedMs: Date.now() - openedAt });
      if (events.length > 64) {
        events.shift();
      }
    };
    for (const event of ['load', 'domcontentloaded', 'crash', 'close']) {
      page.on(event, () => record(event));
    }
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
    const dump = async (phase, error) => {
      if (dumped) {
        return;
      }
      dumped = true;
      let timer;
      const state = await Promise.race([
        page
          .evaluate(() => {
            const canvases = [...document.querySelectorAll('#view canvas')].map((canvas) => ({
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
            return {
              url: location.href,
              viewport: [innerWidth, innerHeight],
              ready: document.readyState,
              focus: document.hasFocus(),
              visibility: document.visibilityState,
              title: document.title,
              status: document.querySelector('#save-status')?.textContent,
              errors: document.querySelector('#errors')?.textContent,
              overlayHidden: document.querySelector('#overlay')?.hidden,
              canvasState,
              canvases,
              frames: globalThis.browserFailureFrames,
              simTime: globalThis.deadvoxSaveTest?.controller?.simTime?.(),
            };
          })
          .catch((failure) => ({ evaluationError: String(failure) })),
        new Promise((resolve) => {
          timer = setTimeout(() => resolve({ canvasState: 'unresponsive', evaluationTimeoutMs: 5000 }), 5000);
        }),
      ]);
      clearTimeout(timer);
      let diagnosticTimer;
      const saveDiagnostics = await Promise.race([
        page
          .evaluate(async () => {
            const capture = async (read) => {
              try {
                return await read();
              } catch (failure) {
                return { error: String(failure) };
              }
            };
            const storage = globalThis.deadvoxSaveTest?.storage;
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
              generationBeforeReload: sessionStorage.getItem('d144-generation-before-reload'),
              d144Pagehide: sessionStorage.getItem('d144-pagehide'),
              d144WriterTrigger: sessionStorage.getItem('d144-writer-trigger'),
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
    for (const method of ['waitForSelector', 'waitForFunction']) {
      const original = page[method].bind(page);
      page[method] = async (...args) => {
        try {
          return await original(...args);
        } catch (error) {
          await dump(`${method}: ${String(args[0]).slice(0, 250)}`, error);
          throw error;
        }
      };
    }
    return dump;
  };
  context.on('page', attach);
  for (const page of context.pages()) {
    attach(page);
  }
}
