// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone browser contract uses Node assertions
// biome-ignore-all lint/style/noProcessEnv: runner controls the executable and pristine checkout for A/B tests
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from './chromium.mjs';
import { browserStageUrl } from './stage-mode.mjs';

const root = resolve(process.env.CASE_VISUAL_ROOT ?? fileURLToPath(new URL('../..', import.meta.url)));
const probePath = resolve(root, '__casePoolProbe.js');
const probeSource = `
import { Scene, PerspectiveCamera, WebGLRenderer } from 'three';
import { buildRegistry } from '/src/core/content.ts';
import { Inventory } from '/src/core/inventory.ts';
import { CaseEffects, FLYING_CASE_CAP } from '/src/render/caseEffects.ts';
import { PileMeshes } from '/src/render/piles.ts';
import { ModelLibrary } from '/src/render/models.ts';
import { SPENT_CASE_SCATTER_CAP } from '/src/core/scatterPile.ts';
const raw = import.meta.glob('./src/content/base/*.json', { eager: true, import: 'default' });
const { registry, issues } = buildRegistry(Object.entries(raw).map(([source, data]) => ({ source, data })));
if (issues.length) throw new Error(JSON.stringify(issues));
const modelDef = registry.models.get('case_5_d_56x45');
if (!modelDef) throw new Error('Missing case_5_d_56x45 model definition');
const mode = new URLSearchParams(location.search).get('mode');
const modelErrors = [];
const models = new ModelLibrary({ ...registry, models: new Map([[modelDef.id, modelDef]]) }, (message) => modelErrors.push(message));
const waitFor = async (condition) => {
  const deadline = performance.now() + 20000;
  while (!condition()) {
    if (performance.now() > deadline) throw new Error('Timed out waiting for case model');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
if (mode === 'loaded') await waitFor(() => models.has(modelDef.id));
if (mode === 'failed') await waitFor(() => modelErrors.length);
const counters = { bufferCreate: 0, bufferDelete: 0, vaoCreate: 0, vaoDelete: 0 };
for (const [key, name] of [['bufferCreate', 'createBuffer'], ['bufferDelete', 'deleteBuffer'], ['vaoCreate', 'createVertexArray'], ['vaoDelete', 'deleteVertexArray']]) {
  const original = WebGL2RenderingContext.prototype[name];
  WebGL2RenderingContext.prototype[name] = function (...args) {
    counters[key]++;
    return original.apply(this, args);
  };
}
const snapshot = () => ({ ...counters });
const delta = (before, after) => Object.fromEntries(Object.keys(before).map((key) => [key, after[key] - before[key]]));
const renderer = new WebGLRenderer({ antialias: false });
renderer.setSize(160, 120);
document.body.append(renderer.domElement);
const scene = new Scene();
const camera = new PerspectiveCamera(60, 160 / 120, 0.01, 100);
camera.position.set(0.25, 2.5, 3);
camera.lookAt(0.25, 1, 0.25);
const inventory = new Inventory(registry);
const addPile = () => {
  if (!inventory.add(inventory.create('spent_case_5_d_56x45', 100), { kind: 'pile', pos: [0, 2, 0] })) throw new Error('Could not seed case pile');
};
addPile();
const piles = new PileMeshes(0.5, models, 13);
scene.add(piles.group);
let groundClones = 0;
const ground = models.ground.bind(models);
models.ground = (id) => {
  const clone = ground(id);
  if (clone && id === modelDef.id) groundClones++;
  return clone;
};
const render = () => renderer.render(scene, camera);
const sync = () => { inventory.version++; piles.sync(inventory); render(); };
const instances = () => piles.group.children.filter((child) => child.isInstancedMesh);
piles.sync(inventory);
render();
const originalInstances = instances();
const warmup = snapshot();
for (let update = 0; update < 100; update++) sync();
const afterUpdates = snapshot();
const pileClones = groundClones;
const sameInstances = originalInstances.length > 0 && originalInstances.every((mesh) => piles.group.children.includes(mesh));
const stack = inventory.piles.values().next().value.items[0].item;
stack.count = 3;
sync();
const reducedCount = instances()[0]?.count;
stack.count = 100;
sync();
const cappedCount = instances()[0]?.count;
const countChanges = delta(afterUpdates, snapshot());
let upgrade;
if (mode === 'delayed') {
  globalThis.__casePoolWaiting = true;
  await waitFor(() => models.has(modelDef.id));
  const before = snapshot();
  sync();
  upgrade = delta(before, snapshot());
}
const effects = new CaseEffects(0.5, models);
scene.add(effects.mesh);
const shot = { origin: [0.25, 1, 0.25], direction: [1, 0.2, 0], speed: 3.5, seed: 13, caseModelId: modelDef.id };
const beforeFlightClones = groundClones;
for (let wave = 0; wave < 100; wave++) {
  for (let slot = 0; slot < FLYING_CASE_CAP; slot++) {
    if (!effects.spawn({ ...shot, seed: wave * FLYING_CASE_CAP + slot })) throw new Error('Case pool filled early');
  }
  if (effects.spawn(shot)) throw new Error('Flying case pool exceeded cap');
  render();
  effects.update(6.1, () => false);
}
const flight = { clones: groundClones - beforeFlightClones, active: effects.activeCount, visuals: effects.mesh.children.length };
const meshesOnRemoval = instances().length;
const beforeRemoval = snapshot();
inventory.piles.clear();
sync();
const removal = delta(beforeRemoval, snapshot());
const childrenAfterRemoval = piles.group.children.length;
addPile();
sync();
const meshesOnTeardown = instances().length;
const beforeTeardown = snapshot();
// Optional calls let the identical probe collect the old implementation's missing-cleanup evidence before asserting.
piles.dispose?.();
effects.dispose?.();
const teardown = delta(beforeTeardown, snapshot());
const result = {
  mode, modelReady: models.has(modelDef.id), modelErrors,
  cap: SPENT_CASE_SCATTER_CAP, flyingCap: FLYING_CASE_CAP,
  warmup, dirtyUpdates: delta(warmup, afterUpdates), pileClones, sameInstances,
  reducedCount, cappedCount, countChanges, upgrade, flight,
  meshesOnRemoval, removal, childrenAfterRemoval, meshesOnTeardown, teardown,
};
renderer.dispose();
globalThis.__casePoolResult = result;
`;

const server = await createServer({
  configFile: resolve(root, 'vite.config.ts'),
  root,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'case-visual-pool-probe',
      enforce: 'pre',
      resolveId(id) {
        if (id === probePath || id === '/__casePoolProbe.js') {
          return probePath;
        }
      },
      load(id) {
        if (id === probePath) {
          return probeSource;
        }
      },
      configureServer(vite) {
        vite.middlewares.use((request, response, next) => {
          if (request.url.startsWith('/__casePoolProbe.html')) {
            response.setHeader('Content-Type', 'text/html');
            response.end('<html><body><script type="module" src="/__casePoolProbe.js"></script></body></html>');
          } else {
            next();
          }
        });
      },
    },
  ],
});

const measure = async (launchedBrowser, address, mode) => {
  const page = await launchedBrowser.newPage();
  const errors = [];
  let caseRequests = 0;
  let releaseRequest;
  const delayed = new Promise((resolveRequest) => {
    releaseRequest = resolveRequest;
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.url().includes('/case-5_d_56x45.glb') && request.resourceType() === 'fetch') {
      caseRequests += 1;
    }
  });
  await page.route('**/case-5_d_56x45.glb*', async (route) => {
    if (route.request().resourceType() !== 'fetch' || mode === 'loaded') {
      await route.continue();
    } else if (mode === 'failed') {
      await route.abort();
    } else {
      await delayed;
      await route.continue();
    }
  });
  try {
    await page.goto(
      browserStageUrl('case-visual-pool', `http://127.0.0.1:${address.port}/__casePoolProbe.html?mode=${mode}`),
    );
    if (mode === 'delayed') {
      await page.waitForFunction(() => globalThis.__casePoolWaiting, undefined, { timeout: 20_000 });
      releaseRequest();
    }
    await page.waitForFunction(() => globalThis.__casePoolResult, undefined, { timeout: 30_000 });
    const result = await page.evaluate(() => globalThis.__casePoolResult);
    process.stdout.write(`case visual pool (${mode}): ${JSON.stringify(result)}\n`);
    assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);
    assert.equal(caseRequests, 1, 'one actual binary fetch (not the Vite URL module)');
    return result;
  } finally {
    releaseRequest();
    await page.close();
  }
};

const verify = (result) => {
  assert.equal(result.modelReady, result.mode !== 'failed');
  assert.equal(result.modelErrors.length, result.mode === 'failed' ? 1 : 0);
  assert.ok(result.warmup.bufferCreate > 0 && result.warmup.vaoCreate > 0, 'real WebGL resources were exercised');
  assert.equal(result.pileClones, 0, 'instanced piles do not clone the ground model');
  assert.deepEqual(result.dirtyUpdates, { bufferCreate: 0, bufferDelete: 0, vaoCreate: 0, vaoDelete: 0 });
  assert.equal(result.sameInstances, true, 'dirty updates retain the warmed InstancedMeshes');
  assert.equal(result.reducedCount, 3);
  assert.equal(result.cappedCount, result.cap);
  assert.deepEqual(result.countChanges, { bufferCreate: 0, bufferDelete: 0, vaoCreate: 0, vaoDelete: 0 });
  assert.equal(result.flight.active, 0);
  assert.equal(result.flight.visuals, result.flyingCap);
  assert.equal(result.flight.clones, result.mode === 'failed' ? 0 : result.flyingCap);
  if (result.mode === 'delayed') {
    assert.equal(result.upgrade.bufferDelete, 1, 'upgrade releases the old fallback instance buffer');
    assert.equal(result.upgrade.vaoDelete, 1, 'upgrade releases the old fallback VAO');
  }
  assert.equal(result.childrenAfterRemoval, 0);
  assert.ok(result.meshesOnRemoval > 0 && result.meshesOnTeardown > 0);
  // One owned instance-matrix buffer and VAO per mesh; deleting shared geometry would exceed this count.
  assert.equal(result.removal.bufferDelete, result.meshesOnRemoval);
  assert.equal(result.removal.vaoDelete, result.meshesOnRemoval);
  assert.equal(result.teardown.bufferDelete, result.meshesOnTeardown);
  assert.equal(result.teardown.vaoDelete, result.meshesOnTeardown);
};

let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  assert(address && typeof address !== 'string');
  browser = await launchChromium('case-visual-pool', { headless: true });
  // Measure all three controls before checking, so fail-before logs show both clone churn and fallback GPU growth.
  const loaded = await measure(browser, address, 'loaded');
  const failed = await measure(browser, address, 'failed');
  const delayed = await measure(browser, address, 'delayed');
  const problems = [];
  for (const result of [loaded, failed, delayed]) {
    try {
      verify(result);
    } catch (error) {
      problems.push(`${result.mode}: ${error.message}`);
    }
  }
  assert.equal(problems.length, 0, problems.join('\n'));
} finally {
  await browser?.close();
  await server.close();
}
