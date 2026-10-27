// biome-ignore-all lint/suspicious/noConsole: correlate browser asset failures with document and context lifetime
// biome-ignore-all lint/correctness/noNodejsModules: standalone browser contract
// biome-ignore-all lint/correctness/noUndeclaredVariables: init scripts run in the page
import assert from 'node:assert/strict';

const PREFIX = 'MODEL_LOAD_AUDIT ';
const records = [];

export const modelLoadAuditPlugin = {
  name: 'model-load-audit-beacons',
  configureServer(server) {
    server.middlewares.use('/__model-load-audit', (request, response) => {
      let body = '';
      request.setEncoding('utf8');
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        const record = JSON.parse(body);
        records.push(record);
        console.log(PREFIX + JSON.stringify(record));
        response.statusCode = 204;
        response.end();
      });
    });
  },
};

export const instrumentModelLoads = (code) => {
  const marker = '    const loader = new GLTFLoader();';
  assert(code.includes(marker), 'model loader audit admission point exists');
  return `import { LoadingManager as AuditLoadingManager } from 'three';\n${code}`.replace(
    marker,
    `    const manager = new AuditLoadingManager();
    const started = new Map();
    manager.setURLModifier((url) => { started.set(url, Date.now()); return url; });
    manager.onError = (url) => globalThis.recordModelLoadAudit?.({
      event: 'asset-error', url, startedAt: started.get(url),
    });
    const loader = new GLTFLoader(manager);
    loader.register((parser) => {
      const load = parser.textureLoader.load;
      parser.textureLoader.load = function(url, onLoad, onProgress, onError) {
        return load.call(this, url, onLoad, onProgress, (error) => {
          globalThis.recordModelLoadAudit?.({
            event: 'texture-error', url, reason: error?.name, message: error?.message, type: error?.type,
          });
          onError?.(error);
        });
      };
      return {name: 'model-load-audit'};
    });`,
  );
};

/** Keep document identity: a previous page's abort must not excuse a live page's load error. */
export const auditModelLoads = async (context) => {
  records.length = 0;
  // An unloading page can lose Playwright console events; beacons preserve its diagnostic identity.
  await context.addInitScript(() => {
    // Set in the page itself: Date.now ties and beacon arrival order cannot say which came first.
    let unloaded = false;
    globalThis.recordModelLoadAudit = (record) => {
      if (location.protocol === 'http:') {
        navigator.sendBeacon(
          '/__model-load-audit',
          JSON.stringify({
            ...record,
            unloaded,
            at: Date.now(),
            document: performance.timeOrigin,
            href: location.href,
          }),
        );
      }
    };
    for (const name of ['beforeunload', 'pagehide']) {
      globalThis.addEventListener(name, (event) => {
        if (event.isTrusted) {
          unloaded ||= name === 'pagehide';
          globalThis.recordModelLoadAudit({ event: name });
        }
      });
    }
  });
  context.on('page', (page) => {
    page.on('requestfailed', (request) => {
      if (request.url().startsWith('blob:')) {
        console.log(
          PREFIX +
            JSON.stringify({ event: 'request-failed', at: Date.now(), url: request.url(), failure: request.failure() }),
        );
      }
    });
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        console.log(PREFIX + JSON.stringify({ event: 'navigation-committed', at: Date.now(), href: frame.url() }));
      }
    });
  });
  return {
    async close() {
      const closeStarted = Date.now();
      console.log(PREFIX + JSON.stringify({ event: 'context-close-start', at: closeStarted }));
      await context.close();
      console.log(PREFIX + JSON.stringify({ event: 'context-close-end', at: Date.now() }));
      for (const error of records.filter((record) => record.event === 'asset-error')) {
        const unload = error.unloaded
          ? records.find((record) => record.document === error.document && record.event === 'pagehide')
          : undefined;
        const texture = records.find(
          (record) =>
            record.event === 'texture-error' && record.document === error.document && record.url === error.url,
        );
        // A document's unload aborts its in-flight fetches, blob textures and model files alike.
        const closeAbort = error.url.startsWith('blob:') && texture?.reason === 'TypeError' && error.at >= closeStarted;
        assert(error.unloaded || closeAbort, `unclassified model load failure: ${JSON.stringify({ error, texture })}`);
        console.log(
          PREFIX +
            JSON.stringify({
              event: 'classified-teardown',
              model: error.model,
              file: error.file,
              url: error.url,
              errorAt: error.at,
              boundary: unload?.event ?? 'context-close-start',
              boundaryAt: unload?.at ?? closeStarted,
            }),
        );
      }
    },
  };
};
