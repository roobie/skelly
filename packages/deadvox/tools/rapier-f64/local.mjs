// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone diagnostic contract
// biome-ignore-all lint/performance/noAwaitInLoops: serial sampling avoids competing benchmark workloads
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const packageDirectory = (precision) =>
  new URL(
    precision === 'f64' ? '../../vendor/rapier-f64/' : '../../../../test-results/rapier-f32/pkg/',
    import.meta.url,
  );
const packageUrl = (precision, directory) =>
  precision === 'f64' ? '/vendor/rapier-f64/' : `/@fs${fileURLToPath(directory)}`;

export async function runLocal(vite, engines, selected, compare = true) {
  const precisions = compare ? ['f64', 'f32'] : ['f64'];
  const artifacts = new URL('../../../../test-results/rapier-agreement/', import.meta.url);
  await mkdir(artifacts, { recursive: true });
  const { runSuite } = await vite.ssrLoadModule('/src/vehicles/feasibility/runner.ts');
  const { firstDivergence } = await vite.ssrLoadModule('/src/vehicles/feasibility/trace.ts');
  const { rapierCandidate } = await vite.ssrLoadModule('/tools/rapier-f64/candidate.ts');
  const results = {};
  const paths = {};
  for (const precision of precisions) {
    const directory = packageDirectory(precision);
    const wasm = await readFile(new URL('rapier_wasm3d_bg.wasm', directory));
    const identity = createHash('sha256').update(wasm).digest('hex');
    const url = packageUrl(precision, directory);
    paths[precision] = url;
    const raw = await vite.ssrLoadModule(`${url}rapier_wasm3d.js`);
    // biome-ignore lint/style/useNamingConvention: wasm-bindgen owns this initialization key
    await raw.default({ module_or_path: wasm });
    const api = await vite.ssrLoadModule(`${url}rapier.js`);
    const candidate = rapierCandidate(api, precision);
    const suite = runSuite(identity, candidate);
    if (precision === 'f64') {
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
    results[precision] = { identity, wasmBytes: wasm.length, suite };
  }
  const address = vite.httpServer.address();
  assert(address && typeof address !== 'string');
  for (const engine of (selected.length > 0 ? selected : Object.keys(engines)).filter((name) => name !== 'node')) {
    assert(Object.hasOwn(engines, engine));
    const browser = await engines[engine]();
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${address.port}/test/browser/vehicle-feasibility.html`);
      for (const precision of precisions) {
        const baseline = results[precision];
        const suite = await page.evaluate(
          async ({ url, identity, precision: numericPrecision }) => {
            const browserRaw = await import(`${url}rapier_wasm3d.js`);
            await browserRaw.default();
            const browserApi = await import(`${url}rapier.js`);
            // biome-ignore lint/correctness/noUnresolvedImports: Vite serves browser-root modules
            const { rapierCandidate: browserCandidate } = await import('/tools/rapier-f64/candidate.ts');
            // biome-ignore lint/correctness/noUnresolvedImports: Vite serves browser-root modules
            const { runSuite: browserSuite } = await import('/src/vehicles/feasibility/runner.ts');
            return browserSuite(identity, browserCandidate(browserApi, numericPrecision));
          },
          { url: paths[precision], identity: baseline.identity, precision },
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
  const costs = (measured) => {
    const ordered = [...measured.regular.tickRealMilliseconds].sort((a, b) => a - b);
    return Object.fromEntries([0.5, 0.95, 0.99].map((p) => [p, ordered[Math.ceil(p * ordered.length) - 1]]));
  };
  const summary = Object.fromEntries(
    Object.entries(results).map(([key, value]) => [
      key,
      {
        wasmBytes: value.wasmBytes,
        identity: value.identity,
        tickMilliseconds: costs(value.suite),
        terminal: value.suite.regular.traces.at(-1).fields.filter(([name]) => name.startsWith('state.')),
      },
    ]),
  );
  await writeFile(new URL('summary.json', artifacts), JSON.stringify(summary, null, 2));
}
