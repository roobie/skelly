// Run under Xvfb for Firefox: `timeout 300 xvfb-run -a node test/browser/save-storage.mjs firefox`.
// biome-ignore-all lint/correctness/noNodejsModules: opt-in browser contract launches Vite and Playwright
// biome-ignore-all lint/performance/noAwaitInLoops: backend and crash-stage matrix is deliberately sequential
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node browser contract uses Node assertions
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const STAGE_TIMEOUT_MS = 30_000;
const OVERALL_TIMEOUT_MS = 180_000;
const browserName = process.argv[2] ?? 'chromium';
if (!['chromium', 'firefox'].includes(browserName)) {
  throw new Error(`Expected browser name chromium or firefox, got ${browserName}`);
}
const { chromium, firefox } = await import('playwright');
const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const vite = await createServer({
  configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
  root: projectRoot,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
const freePort = async () =>
  new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
const waitForCdp = async (cdpUrl, childProcess, startupError) => {
  const until = Date.now() + STAGE_TIMEOUT_MS;
  while (Date.now() < until) {
    if (startupError.error || childProcess.exitCode !== null) {
      throw new Error(`System Chromium failed to start: ${startupError.error?.message ?? childProcess.exitCode}`);
    }
    try {
      const response = await fetch(`${cdpUrl}/json/version`);
      if (response.ok) {
        return;
      }
    } catch {
      // The CDP listener isn't ready yet.
    }
    await delay(100);
  }
  throw new Error(`System Chromium CDP endpoint timed out: ${cdpUrl}`);
};
const withTimeout = async (label, task, timeoutMs = STAGE_TIMEOUT_MS) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    globalThis.clearTimeout(timer);
  }
};
let browser;
let chromeProcess;
let chromeExitPromise;
let profile;
try {
  await withTimeout('Vite startup', vite.listen());
  const address = vite.httpServer.address();
  assert(address && typeof address !== 'string');
  const testUrl = `http://127.0.0.1:${address.port}/test/browser/save-storage-contract.html`;
  let context;
  if (browserName === 'chromium') {
    const cdpPort = await freePort();
    profile = await mkdtemp(join(tmpdir(), 'deadvox-save-storage-'));
    const startupError = { error: undefined };
    chromeProcess = spawn(
      // biome-ignore lint/style/noProcessEnv: matches tools/ui-browser-contract.mjs's CHROME_BIN override.
      process.env.CHROME_BIN ?? 'google-chrome',
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--enable-webgl',
        '--use-gl=swiftshader',
        '--enable-unsafe-swiftshader',
        `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${profile}`,
        '--window-size=1280,900',
        testUrl,
      ],
      { stdio: 'ignore' },
    );
    chromeExitPromise = new Promise((resolve) => chromeProcess.once('exit', resolve));
    chromeProcess.on('error', (error) => {
      startupError.error = error;
    });
    const cdpUrl = `http://127.0.0.1:${cdpPort}`;
    await withTimeout('system Chromium startup', waitForCdp(cdpUrl, chromeProcess, startupError));
    browser = await withTimeout('Chromium CDP connection', chromium.connectOverCDP(cdpUrl));
    [context] = browser.contexts();
    assert(context);
  } else {
    browser = await withTimeout('Playwright Firefox launch', firefox.launch({ headless: false }));
    context = await browser.newContext();
  }
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${address.port}/test/browser/save-storage-contract.html`, {
    timeout: STAGE_TIMEOUT_MS,
  });
  await page.waitForSelector('#ready', { timeout: STAGE_TIMEOUT_MS });

  const contract = await withTimeout(
    'overall browser storage contract',
    page.evaluate(async (stageTimeoutMs) => {
      // biome-ignore lint/correctness/noUnresolvedImports: Vite serves this project-root source path.
      const { SaveStorage } = await import('/src/game/saveStorage.ts');
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      const stage = async (label, task) => {
        let timer;
        const timeout = new Promise((_, reject) => {
          timer = globalThis.setTimeout(
            () => reject(new Error(`${label} timed out after ${stageTimeoutMs} ms`)),
            stageTimeoutMs,
          );
        });
        try {
          return await Promise.race([task, timeout]);
        } finally {
          globalThis.clearTimeout(timer);
        }
      };
      const namespaceFor = async (label) => {
        const digest = await crypto.subtle.digest('SHA-256', encoder.encode(label));
        return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      };
      const create = (backend, extra = {}) => new SaveStorage({ backend, requestTimeoutMs: 15_000, ...extra });
      const saveValue = (storage, namespace, value) =>
        storage.save(namespace, async (generation) => encoder.encode(`${generation}:${value}`));
      const testRoundTrip = async (backend) => {
        const storage = create(backend);
        const status = await stage(`${backend} capability status`, storage.status());
        if (status.backend !== backend) {
          throw new Error(`Forced ${backend} selected ${status.backend}`);
        }
        const namespace = await namespaceFor(`round-trip:${backend}`);
        await stage(`${backend} first generation write`, saveValue(storage, namespace, 'first'));
        await stage(`${backend} second generation write`, saveValue(storage, namespace, 'second'));
        const loaded = await stage(`${backend} read newest generation`, storage.load(namespace));
        if (loaded?.generation !== 2 || decoder.decode(loaded?.payload ?? new Uint8Array()) !== '2:second') {
          throw new Error(`${backend} did not load its newest complete record`);
        }
        const result = { backend, quotaSupported: status.quota.supported, persistent: status.persistent };
        storage.close();
        return result;
      };
      const testTwoTabs = async (backend) => {
        const namespace = await namespaceFor(`two-tabs:${backend}`);
        const left = create(backend);
        const right = create(backend);
        await stage(`${backend} two-tab capability probes`, Promise.all([left.status(), right.status()]));
        const results = await stage(
          `${backend} two-tab concurrent commits`,
          Promise.all([saveValue(left, namespace, 'tab-left'), saveValue(right, namespace, 'tab-right')]),
        );
        const loaded = await stage(`${backend} two-tab final read`, left.load(namespace));
        const generations = results.map(({ generation }) => generation).sort((a, b) => a - b);
        if (generations[0] !== 1 || generations[1] !== 2 || loaded?.generation !== 2) {
          throw new Error(`${backend} two-tab writes were not serialized: ${generations.join(',')}`);
        }
        left.close();
        right.close();
        return { backend, generations };
      };
      const testCrashStage = async (backend, crashAt) => {
        const namespace = await namespaceFor(`crash:${backend}:${crashAt}`);
        const seedStorage = create(backend);
        await stage(`${backend}/${crashAt} seed probe`, seedStorage.status());
        await stage(`${backend}/${crashAt} seed old generation`, saveValue(seedStorage, namespace, 'old'));
        seedStorage.close();

        const crashedStorage = create(backend, { testCrashAt: crashAt, requestTimeoutMs: 2000 });
        await stage(`${backend}/${crashAt} crash probe`, crashedStorage.status());
        let writeFailed = false;
        try {
          await stage(`${backend}/${crashAt} injected write`, saveValue(crashedStorage, namespace, 'new'));
        } catch {
          writeFailed = true;
        }
        crashedStorage.close();
        if (!writeFailed) {
          throw new Error(`${backend} crash injection at ${crashAt} reported success`);
        }

        const reader = create(backend);
        await stage(`${backend}/${crashAt} recovery probe`, reader.status());
        const loaded = await stage(`${backend}/${crashAt} recovery read`, reader.load(namespace));
        const payload = loaded ? decoder.decode(loaded.payload) : '';
        if (!(loaded && ['1:old', '2:new'].includes(payload))) {
          throw new Error(`${backend} crash at ${crashAt} left no whole generation (${payload})`);
        }
        reader.close();
        return { backend, stage: crashAt, loadedGeneration: loaded.generation, payload };
      };

      const autoStorage = create('auto');
      const autoStatus = await stage('automatic backend feature detection', autoStorage.status());
      if (!['opfs', 'indexeddb'].includes(autoStatus.backend)) {
        throw new Error(`Feature detection selected unsupported backend ${autoStatus.backend}`);
      }
      autoStorage.close();
      const backends = autoStatus.backend === 'opfs' ? ['opfs', 'indexeddb'] : ['indexeddb'];
      const backendResults = [];
      const concurrentBackendResults = [];
      const crashResults = [];
      for (const backend of backends) {
        backendResults.push(await testRoundTrip(backend));
        concurrentBackendResults.push(await testTwoTabs(backend));
        const crashStages =
          backend === 'opfs'
            ? ['before-truncate', 'after-truncate', 'after-partial-write', 'after-write', 'after-flush']
            : ['before-transaction', 'after-read', 'after-put', 'after-commit'];
        for (const crashAt of crashStages) {
          crashResults.push(await testCrashStage(backend, crashAt));
        }
      }
      return { autoBackend: autoStatus.backend, backendResults, concurrentBackendResults, crashResults };
    }, STAGE_TIMEOUT_MS),
    OVERALL_TIMEOUT_MS,
  );

  const expectedBackends = contract.autoBackend === 'opfs' ? 2 : 1;
  assert.equal(contract.backendResults.length, expectedBackends);
  assert.equal(contract.concurrentBackendResults.length, expectedBackends);
  assert.equal(contract.crashResults.length, contract.autoBackend === 'opfs' ? 9 : 4);
  assert.deepEqual(pageErrors, []);
  process.stdout.write(
    `${browserName}: auto selected ${contract.autoBackend}; tested ${contract.backendResults.map(({ backend }) => backend).join(', ')}; round-trip, contention, and ${contract.crashResults.length} kill stages passed\n`,
  );
} finally {
  await withTimeout('browser shutdown', browser?.close() ?? Promise.resolve(), 5000).catch((error) => {
    process.stderr.write(`Cleanup warning: ${String(error)}\n`);
  });
  if (chromeProcess && chromeProcess.exitCode === null && chromeProcess.signalCode === null) {
    chromeProcess.kill('SIGTERM');
    await withTimeout('system Chromium shutdown', chromeExitPromise, 5000).catch((error) => {
      process.stderr.write(`Cleanup warning: ${String(error)}\n`);
    });
  }
  if (profile) {
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
  await withTimeout('Vite shutdown', vite.close(), 5000).catch((error) => {
    process.stderr.write(`Cleanup warning: ${String(error)}\n`);
  });
}
