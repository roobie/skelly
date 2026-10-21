// biome-ignore-all lint/correctness/noNodejsModules: standalone browser diagnostic
// biome-ignore-all lint/correctness/noUndeclaredVariables: init script runs in the browser
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const PREFIX = 'practice-pointer-probe:';

/** Observe both sides of navigation; an absent completion alone cannot locate a stalled request. */
export const practicePointerProbe = async (page, context, directory) => {
  await mkdir(directory, { recursive: true });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  const started = performance.now();
  const events = [];
  const requests = new Map();
  let navigationSequence = 0;
  const record = (type, detail) =>
    events.push({ at: performance.now() - started, navigationSequence, type, ...detail });
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      navigationSequence += 1;
    }
    // This is the sequence at observation, not document ownership: outgoing workers may still issue requests.
    requests.set(request, {
      navigationSequence,
      url: request.url(),
      resource: request.resourceType(),
      started: performance.now() - started,
      outcome: 'outstanding',
    });
  });
  page.on('response', (response) => {
    const entry = requests.get(response.request());
    if (entry) {
      entry.response = { at: performance.now() - started, status: response.status() };
    }
  });
  const complete = (request, outcome) => {
    const entry = requests.get(request);
    if (entry) {
      Object.assign(entry, {
        outcome,
        ended: performance.now() - started,
        failure: request.failure()?.errorText,
        timing: request.timing(),
      });
    }
  };
  page.on('requestfinished', (request) => complete(request, 'finished'));
  page.on('requestfailed', (request) => complete(request, 'failed'));
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) {
      record('navigation', { url: frame.url() });
    }
  });
  page.on('worker', (worker) => {
    const workerNavigation = navigationSequence;
    record('worker', { url: worker.url(), workerNavigation });
    worker.on('close', () => record('worker-close', { url: worker.url(), workerNavigation }));
  });
  page.on('pageerror', (error) => record('pageerror', { message: error.message }));
  page.on('console', (message) => record('console', { message: message.text() }));
  await page.addInitScript((prefix) => {
    const describe = (target) => (target instanceof Element ? `${target.tagName}#${target.id}` : String(target));
    for (const type of ['pointerdown', 'pointerup', 'click', 'pointerlockchange', 'DOMContentLoaded']) {
      document.addEventListener(
        type,
        (event) => {
          const cursor = document.querySelector('#game-cursor');
          // biome-ignore lint/suspicious/noConsole: synchronous event evidence must survive document replacement
          console.debug(
            prefix +
              JSON.stringify({
                type,
                url: location.href,
                ready: document.readyState,
                target: describe(event.target),
                owner: event.target instanceof Element ? event.target.closest('#death, #tutorial-actions')?.id : null,
                trusted: event.isTrusted,
                lock: describe(document.pointerLockElement),
                x: event.clientX,
                y: event.clientY,
                hit:
                  typeof event.clientX === 'number'
                    ? describe(document.elementFromPoint(event.clientX, event.clientY))
                    : null,
                cursor: cursor ? { hidden: cursor.hidden, transform: cursor.style.transform } : null,
                startupHidden: document.querySelector('#startup-screen')?.hidden,
              }),
          );
        },
        true,
      );
    }
  }, PREFIX);
  return {
    finish: async () => {
      record('end', { url: page.url() });
      const all = [...requests.values()];
      await writeFile(
        join(directory, 'requests.json'),
        JSON.stringify(
          { events, requests: all, outstanding: all.filter((entry) => entry.outcome === 'outstanding') },
          null,
          2,
        ),
      );
      await context.tracing.stop({ path: join(directory, 'trace.zip') });
    },
  };
};
