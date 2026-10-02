import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const probePath = resolve(root, '__casePoolProbe.js');
const probeSource = `
import { Scene, PerspectiveCamera, WebGLRenderer } from 'three';
import { buildRegistry } from '/src/core/content.ts';
import { Inventory } from '/src/core/inventory.ts';
import { CaseEffects, FLYING_CASE_CAP } from '/src/render/caseEffects.ts';
import { PileMeshes } from '/src/render/piles.ts';
import { ModelLibrary } from '/src/render/models.ts';
import { SPENT_CASE_SCATTER_CAP } from '/src/render/spentCaseScatter.ts';
const raw = import.meta.glob('./src/content/base/*.json', { eager: true, import: 'default' });
const { registry, issues } = buildRegistry(Object.entries(raw).map(([source, data]) => ({ source, data })));
if (issues.length) throw new Error(JSON.stringify(issues));
const modelDef = registry.models.get('case_5_d_56x45');
if (!modelDef) throw new Error('Missing case_5_d_56x45 model definition');
const modelErrors = [];
const models = new ModelLibrary({ ...registry, models: new Map([[modelDef.id, modelDef]]) }, (message) => modelErrors.push(message));
const counters = { bufferCreate: 0, bufferDelete: 0, vaoCreate: 0, vaoDelete: 0 };
for (const [key, name] of [['bufferCreate', 'createBuffer'], ['bufferDelete', 'deleteBuffer'], ['vaoCreate', 'createVertexArray'], ['vaoDelete', 'deleteVertexArray']]) {
  const original = WebGL2RenderingContext.prototype[name];
  WebGL2RenderingContext.prototype[name] = function (...args) {
    counters[key]++;
    return original.apply(this, args);
  };
}
const failedModel = location.search.includes('failed=1');
if (failedModel) {
  while (!modelErrors.length) await new Promise((resolve) => setTimeout(resolve, 10));
} else {
  while (!models.has(modelDef.id)) await new Promise((resolve) => setTimeout(resolve, 10));
}
const renderer = new WebGLRenderer({ antialias: false });
renderer.setSize(160, 120);
document.body.append(renderer.domElement);
const scene = new Scene();
const camera = new PerspectiveCamera(60, 160 / 120, 0.01, 100);
camera.position.set(0.25, 2.5, 3);
camera.lookAt(0.25, 1, 0.25);
const inventory = new Inventory(registry);
if (!inventory.add(inventory.create('spent_case_5_d_56x45', 100), { kind: 'pile', pos: [0, 2, 0] })) throw new Error('Could not seed case pile');
const piles = new PileMeshes(0.5, models, 13);
scene.add(piles.group);
let groundClones = 0;
const ground = models.ground.bind(models);
models.ground = (id) => {
  if (id === modelDef.id) groundClones++;
  return ground(id);
};
let render = () => renderer.render(scene, camera);
piles.sync(inventory);
render();
const instance = piles.group.children.find((child) => child.isInstancedMesh);
if (!instance) throw new Error('Pile did not create its case InstancedMesh');
const firstVisibleCount = instance.count;
const afterWarmup = { ...counters };
for (let update = 0; update < 100; update++) {
  inventory.version++;
  piles.sync(inventory);
  render();
}
const afterUpdates = { ...counters };
const sameInstance = piles.group.children.includes(instance);
const effects = new CaseEffects(0.5, models);
scene.add(effects.mesh);
const shot = { origin: [0.25, 1, 0.25], direction: [1, 0.2, 0], speed: 3.5, seed: 13, caseModelId: modelDef.id };
for (let wave = 0; wave < 100; wave++) {
  for (let slot = 0; slot < FLYING_CASE_CAP; slot++) {
    if (!effects.spawn({ ...shot, seed: wave * FLYING_CASE_CAP + slot })) throw new Error('Case pool filled early');
  }
  render();
  effects.update(6.1, () => false);
}
const flightResult = { groundClones, active: effects.activeCount, visuals: effects.mesh.children.length };
const bufferBeforeDispose = { ...counters };
piles.dispose();
const afterDispose = { ...counters };
effects.dispose();
const result = {
  failedModel,
  requestCount: modelErrors.length,
  modelReady: models.has(modelDef.id),
  visibleCount: firstVisibleCount,
  scatterCap: SPENT_CASE_SCATTER_CAP,
  sameInstance,
  afterWarmup,
  afterUpdates,
  flightResult,
  bufferBeforeDispose,
  afterDispose,
  createDuringDirtyUpdates: afterUpdates.bufferCreate - afterWarmup.bufferCreate,
  vaoDuringDirtyUpdates: afterUpdates.vaoCreate - afterWarmup.vaoCreate,
  bufferReleased: afterDispose.bufferDelete - bufferBeforeDispose.bufferDelete,
  vaoReleased: afterDispose.vaoDelete - bufferBeforeDispose.vaoDelete,
  modelErrors,
};
globalThis.__casePoolResult = result;
`;

const server = await createServer({
  root,
  server: { host: '127.0.0.1', port: 0 },
  plugins: [
    {
      name: 'case-visual-pool-probe',
      enforce: 'pre',
      resolveId(id) {
        if (id === probePath || id === '/__casePoolProbe.js') return probePath;
      },
      load(id) {
        if (id === probePath) return probeSource;
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
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_BIN, args: ['--no-sandbox'] });

try {
  for (const failed of [false, true]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
      console.error('case-visual probe page error:', error.message);
    });
    page.on('console', (message) => {
      if (message.type() === 'error') console.error('case-visual probe console error:', message.text());
    });
    let caseRequests = 0;
    page.on('request', (request) => {
      if (request.url().includes('case_5_d_56x45.glb') && request.resourceType() === 'fetch') caseRequests++;
    });
    if (failed) {
      await page.route('**/case_5_d_56x45.glb*', (route) =>
        route.request().resourceType() === 'fetch' ? route.abort() : route.continue(),
      );
    }
    await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__casePoolProbe.html${failed ? '?failed=1' : ''}`);
    await page.waitForFunction(() => globalThis.__casePoolResult, undefined, { timeout: 90000 });
    const result = await page.evaluate(() => globalThis.__casePoolResult);
    assert.deepEqual(errors, [], `browser errors: ${errors.join('; ')}`);
    assert.equal(result.failedModel, failed);
    assert.equal(result.modelReady, !failed);
    assert.equal(result.visibleCount, result.scatterCap);
    assert.equal(result.sameInstance, true);
    assert.equal(result.createDuringDirtyUpdates, 0);
    assert.equal(result.vaoDuringDirtyUpdates, 0);
    assert.equal(result.flightResult.active, 0);
    assert.equal(result.flightResult.visuals, FLYING_CASE_CAP);
    assert.equal(result.flightResult.groundClones, failed ? 0 : FLYING_CASE_CAP);
    if (failed) {
      assert.equal(caseRequests, 1);
      assert.ok(result.bufferReleased > 0, 'fallback InstancedMesh buffers are released on disposal');
      assert.ok(result.vaoReleased > 0, 'fallback InstancedMesh VAOs are released on disposal');
    } else {
      assert.equal(caseRequests, 1);
      assert.equal(result.modelErrors.length, 0);
    }
    console.log(`case visual pool (${failed ? 'GLB fallback' : 'loaded GLB'}) passed`, JSON.stringify(result));
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
