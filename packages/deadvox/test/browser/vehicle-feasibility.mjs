// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node browser contract
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from './chromium.mjs';

const { firefox, webkit } = await import('playwright');

const root = fileURLToPath(new URL('../..', import.meta.url));
const vite = await createServer({
  configFile: false,
  root,
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { host: '127.0.0.1', port: 0 },
});
const artifactDirectory = new URL('../../test-results/vehicle-feasibility/', import.meta.url);
const timingSummary = (samples) => {
  const ordered = [...samples].sort((a, b) => a - b);
  const percentile = (fraction) => ordered[Math.ceil(ordered.length * fraction) - 1];
  return { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: ordered.at(-1) };
};
const summarize = (suite) => ({
  tickRealMilliseconds: timingSummary(suite.regular.tickRealMilliseconds),
  admissionRealMilliseconds: suite.regular.admissionRealMilliseconds,
  restoreRealMilliseconds: suite.restored.restoreRealMilliseconds,
  compressedSimSecondsPerRealSecond: suite.compressed.simSecondsPerRealSecond,
  work: suite.regular.work,
  differences: suite.differences,
});
const engines = {
  chromium: () => launchChromium('vehicle-feasibility'),
  firefox: () => firefox.launch(),
  webkit: () => webkit.launch(),
};
try {
  await vite.listen();
  await mkdir(artifactDirectory, { recursive: true });
  if (process.argv.includes('--driving')) {
    const { runDrivingComparison } = await import('./vehicle-driving.mjs');
    await runDrivingComparison(
      vite,
      engines,
      process.argv.slice(2).filter((argument) => argument !== '--driving'),
    );
  } else if (process.argv.includes('--local-rapier')) {
    const { runLocal } = await import('../../tools/rapier-f64/local.mjs');
    await runLocal(
      vite,
      engines,
      process.argv.slice(2).filter((argument) => argument !== '--local-rapier'),
    );
  } else {
    const { runDrivingComparison } = await import('./vehicle-driving.mjs');
    await runDrivingComparison(vite, engines, process.argv.slice(2));
    const { runLocal } = await import('../../tools/rapier-f64/local.mjs');
    await runLocal(vite, engines, process.argv.slice(2), false);
    const { runSuite } = await vite.ssrLoadModule('/src/vehicles/feasibility/runner.ts');
    const { firstDivergence } = await vite.ssrLoadModule('/src/vehicles/feasibility/trace.ts');
    const fingerprint = await vite.ssrLoadModule('/tools/simulationFingerprint.ts');
    const graph = await fingerprint.collectSimulationSourceGraph(fingerprint.FEASIBILITY_ENTRIES, root, {
      resolve: async (specifier, importer) => (await vite.pluginContainer.resolveId(specifier, importer))?.id,
      readFile: (path) => readFile(path, 'utf8'),
    });
    const build = fingerprint.fingerprintSimulationSourceMap(graph.sources);
    const wasm = await readFile(new URL('../../vendor/rapier-f64/rapier_wasm3d_bg.wasm', import.meta.url));
    const identities = {
      packageLockSha256: createHash('sha256')
        .update(await readFile(new URL('../../../../package-lock.json', import.meta.url)))
        .digest('hex'),
      sourceFingerprint: build,
      rapierWasmSha256: createHash('sha256').update(wasm).digest('hex'),
      rapierRole: 'committed f64 diagnostic candidate; agreement measured by runLocal',
    };
    const baseline = runSuite(build);
    await writeFile(
      new URL('node.json', artifactDirectory),
      JSON.stringify({ engine: process.version, identities, suite: baseline }),
    );
    await writeFile(
      new URL('node-summary.json', artifactDirectory),
      JSON.stringify({ engine: process.version, ...summarize(baseline) }, null, 2),
    );
    assert.deepEqual(baseline.differences, [null, null, null], 'Node schedule/restore agreement');
    const address = vite.httpServer.address();
    assert(address && typeof address !== 'string');
    const selected = process.argv.slice(2);
    for (const engine of (selected.length > 0 ? selected : Object.keys(engines)).filter((name) => name !== 'node')) {
      assert(Object.hasOwn(engines, engine), `Unknown engine: ${engine}`);
      // biome-ignore lint/performance/noAwaitInLoops: serialize engines so timing samples do not compete with each other
      const browser = await engines[engine]();
      try {
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${address.port}/test/browser/vehicle-feasibility.html`);
        const suite = await page.evaluate(async (identity) => {
          // biome-ignore lint/correctness/noUnresolvedImports: Vite serves this browser-root module URL
          const { runSuite: browserSuite } = await import('/src/vehicles/feasibility/runner.ts');
          return browserSuite(identity);
        }, build);
        const difference = firstDivergence(baseline.regular.traces, suite.regular.traces) ?? null;
        await writeFile(
          new URL(`${engine}.json`, artifactDirectory),
          JSON.stringify({
            engine,
            version: browser.version(),
            identities,
            difference,
            suite,
          }),
        );
        await writeFile(
          new URL(`${engine}-summary.json`, artifactDirectory),
          JSON.stringify({ engine, version: browser.version(), difference, ...summarize(suite) }, null, 2),
        );
        assert.deepEqual(suite.differences, [null, null, null], `${engine} schedule/restore agreement`);
        assert.deepEqual(suite.regular.identity, baseline.regular.identity);
        assert.equal(difference, null, `${engine}: ${JSON.stringify(difference)}`);
      } finally {
        await browser.close();
      }
    }
  }
} finally {
  await vite.close();
}
