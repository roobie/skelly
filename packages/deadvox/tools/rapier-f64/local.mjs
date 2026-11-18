// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone diagnostic contract
// biome-ignore-all lint/performance/noAwaitInLoops: serial sampling avoids competing benchmark workloads
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { listeningPort } from '../../test/browser/stageServer.mjs';

/**
 * @import { Browser } from 'playwright'
 * @import { ViteDevServer } from 'vite'
 * @import { RapierApi } from '../../src/core/rapier.ts'
 * @import { Candidate } from '../../src/feasibility/contract.ts'
 * @import * as Runner from '../../src/feasibility/runner.ts'
 * @import * as Trace from '../../src/feasibility/trace.ts'
 * @import * as CandidateModule from './candidate.ts'
 */
/** @typedef {ReturnType<typeof Runner.runSuite>} Suite */
/** @typedef {{ url: string; identity: string; wasmBytes: number; suite: Suite }} PrecisionResult */

/** @param {string} precision */
const packageDirectory = (precision) =>
  new URL(
    precision === 'f64' ? '../../vendor/rapier-f64/' : '../../../../test-results/rapier-f32/pkg/',
    import.meta.url,
  );
/**
 * @param {string} precision
 * @param {URL} directory
 */
const packageUrl = (precision, directory) =>
  precision === 'f64' ? '/vendor/rapier-f64/' : `/@fs${fileURLToPath(directory)}`;
const modules = { runner: '/src/feasibility/runner.ts', candidate: '/tools/rapier-f64/candidate.ts' };

/**
 * @param {ViteDevServer} vite
 * @param {Readonly<Record<string, () => Promise<Browser>>>} engines
 * @param {readonly string[]} selected
 */
export async function runLocal(vite, engines, selected, compare = true) {
  const precisions = compare ? ['f64', 'f32'] : ['f64'];
  const artifacts = new URL('../../../../test-results/rapier-agreement/', import.meta.url);
  await mkdir(artifacts, { recursive: true });
  const { runSuite } = /** @type {typeof Runner} */ (await vite.ssrLoadModule(modules.runner));
  const { firstDivergence } = /** @type {typeof Trace} */ (await vite.ssrLoadModule('/src/feasibility/trace.ts'));
  const { rapierCandidate } = /** @type {typeof CandidateModule} */ (await vite.ssrLoadModule(modules.candidate));
  /** @type {Map<string, PrecisionResult>} */
  const results = new Map();
  for (const precision of precisions) {
    const directory = packageDirectory(precision);
    const wasm = await readFile(new URL('rapier_wasm3d_bg.wasm', directory));
    const identity = createHash('sha256').update(wasm).digest('hex');
    const url = packageUrl(precision, directory);
    const raw = await vite.ssrLoadModule(`${url}rapier_wasm3d.js`);
    // biome-ignore lint/style/useNamingConvention: wasm-bindgen owns this initialization key
    await raw.default({ module_or_path: wasm });
    // The f32 build generates the same bindings as the vendored f64 one.
    const api = /** @type {RapierApi} */ (await vite.ssrLoadModule(`${url}rapier.js`));
    const candidate = rapierCandidate(api, precision);
    const suite = runSuite(identity, candidate);
    if (precision === 'f64') {
      /** @type {Candidate} */
      const mutant = {
        ...candidate,
        create: (...args) => {
          const adapter = candidate.create(...args);
          return {
            ...adapter,
            restore: (bytes) => {
              const damaged = bytes.slice();
              new DataView(damaged.buffer).setFloat64(8, 0, true);
              adapter.restore(damaged);
            },
          };
        },
      };
      assert.notEqual(
        runSuite(identity, mutant).differences[1],
        null,
        'missing controller phase must fail continuation',
      );
      const coordinates = new Float64Array([0, 0, 0, 1 + Number.EPSILON, 0, 0, 0, 1, 0]);
      const world = new api.World({ x: 0, y: 0, z: 0 });
      try {
        const collider = world.createCollider(api.ColliderDesc.trimesh(coordinates, new Uint32Array([0, 1, 2])));
        assert(collider.vertices() instanceof Float64Array, 'physical geometry uses double buffers');
        assert.deepEqual(collider.vertices(), coordinates, 'geometry must not narrow to f32');
      } finally {
        world.free();
      }
    }
    await writeFile(new URL(`node-${precision}.json`, artifacts), JSON.stringify(suite));
    assert.deepEqual(suite.differences, [null, null, null], `${precision} Node continuation`);
    results.set(precision, { url, identity, wasmBytes: wasm.length, suite });
  }
  const port = listeningPort(vite);
  for (const engine of (selected.length > 0 ? selected : Object.keys(engines)).filter((name) => name !== 'node')) {
    const launch = Object.hasOwn(engines, engine) ? engines[engine] : undefined;
    assert(launch);
    const browser = await launch();
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${port}/test/browser/vehicle-feasibility.html`);
      for (const [precision, baseline] of results) {
        /** @type {Suite} */
        const suite = await page.evaluate(
          async ({ url, identity, precision: numericPrecision, served }) => {
            const browserRaw = await import(`${url}rapier_wasm3d.js`);
            await browserRaw.default();
            const browserApi = await import(`${url}rapier.js`);
            const { rapierCandidate: browserCandidate } = await import(served.candidate);
            const { runSuite: browserSuite } = await import(served.runner);
            return browserSuite(identity, browserCandidate(browserApi, numericPrecision));
          },
          { url: baseline.url, identity: baseline.identity, precision, served: modules },
        );
        const difference = firstDivergence(baseline.suite.regular.traces, suite.regular.traces) ?? null;
        await writeFile(
          new URL(`${engine}-${precision}.json`, artifacts),
          JSON.stringify({ version: browser.version(), difference, suite }),
        );
        assert.deepEqual(suite.differences, [null, null, null], `${engine} ${precision} save/schedules`);
        assert.equal(difference, null, `${engine} ${precision}: ${JSON.stringify(difference)}`);
      }
    } finally {
      await browser.close();
    }
  }
  /** @param {Suite} measured */
  const costs = (measured) => {
    const ordered = [...measured.regular.tickRealMilliseconds].sort((a, b) => a - b);
    return Object.fromEntries([0.5, 0.95, 0.99].map((p) => [p, ordered[Math.ceil(p * ordered.length) - 1]]));
  };
  /** @param {Suite} measured */
  const terminalState = (measured) => {
    const terminal = measured.regular.traces.at(-1);
    assert(terminal, 'a regular run records traces');
    return terminal.fields.filter(([name]) => name.startsWith('state.'));
  };
  const summary = Object.fromEntries(
    [...results].map(([key, value]) => [
      key,
      {
        wasmBytes: value.wasmBytes,
        identity: value.identity,
        tickMilliseconds: costs(value.suite),
        terminal: terminalState(value.suite),
      },
    ]),
  );
  await writeFile(new URL('summary.json', artifacts), JSON.stringify(summary, null, 2));
}
