// biome-ignore-all lint/correctness/noNodejsModules: dev tool starts Vite and writes a screenshot
// biome-ignore-all lint/suspicious/noConsole: CLI evidence goes to stdout
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from '../test/browser/chromium.mjs';

const [out, ...extra] = process.argv.slice(2);
if (!out || extra.length > 0) {
  throw new Error('usage: node tools/furniture-detail-probe.mjs <screenshot.png>');
}
// Hoisting puts three outside this project, so the page loads it by absolute path through Vite.
const threeFile = createRequire(import.meta.url)
  .resolve('three')
  .replace(/three\.cjs$/, 'three.module.js');
const threeUrl = `/@fs${threeFile}`;
const server = await createServer({
  root: fileURLToPath(new URL('../', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, open: false, fs: { allow: [dirname(threeFile)] } },
});
let browser;
try {
  await server.listen();
  const address = server.httpServer.address();
  const url = `http://127.0.0.1:${address.port}/`;
  browser = await launchChromium('render-probe', { headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 600 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  await page.route(url, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><link rel="icon" href="data:,"></head><body style="margin:0"></body></html>',
    }),
  );
  await page.goto(url);
  const cost = await page.evaluate(async (threeModule) => {
    const Three = await import(new URL(threeModule, location.href).href);
    const { buildRegistry } = await import(new URL('/src/core/content.ts', location.href).href);
    const { BlockEntities } = await import(new URL('/src/core/blockEntities.ts', location.href).href);
    const { FurnitureMeshes } = await import(new URL('/src/render/furniture.ts', location.href).href);
    const { default: data } = await import(new URL('/src/content/base/furniture.json', location.href).href);
    const definitions = data.furniture
      .filter((definition) => definition.appearance)
      .map(({ loot, ...definition }) => definition);
    if (definitions.length === 0) {
      throw new Error('no appearance fixtures to inspect');
    }
    const { registry, issues } = buildRegistry([
      { source: 'look.json', data: { furnitureMaterials: data.furnitureMaterials, furniture: definitions } },
    ]);
    if (issues.length > 0) {
      throw new Error(JSON.stringify(issues));
    }
    // Each fixture stands intact at the left of its row, then once at the start of each of its material's damage steps;
    // the camera looks along +z, so a row runs toward -x to read left to right.
    const entities = new BlockEntities(registry);
    const damage = new Map();
    let z = 0;
    for (const definition of definitions) {
      const steps = registry.furnitureMaterials.get(definition.material)?.damaged ?? [];
      let x = 0;
      for (const fraction of [0, ...steps.map((step) => step.from)]) {
        const piece = entities.add({ type: definition.id, size: definition.size, pos: [x, 0, z], facing: 'n' });
        if (!piece) {
          throw new Error(`could not place ${definition.id}`);
        }
        if (fraction > 0) {
          damage.set(piece.uid, fraction * definition.breach.durability);
        }
        x -= definition.size[0] + 1;
      }
      z += definition.size[2] + 3;
    }
    const state = entities.snapshotState();
    entities.restoreState({
      ...state,
      entities: state.entities.map((saved) =>
        damage.has(saved.uid) ? { ...saved, damage: damage.get(saved.uid) } : saved,
      ),
    });
    const furniture = new FurnitureMeshes(0.5);
    furniture.sync(entities);
    const scene = new Three.Scene();
    scene.background = new Three.Color('#323e49');
    scene.add(furniture.group, new Three.HemisphereLight('#ffffff', '#696052', 2));
    const sun = new Three.DirectionalLight('#fff1d4', 2);
    sun.position.set(-2, 5, -3);
    scene.add(sun);
    const bounds = new Three.Box3().setFromObject(furniture.group);
    const center = bounds.getCenter(new Three.Vector3());
    const size = bounds.getSize(new Three.Vector3());
    const distance = Math.max(size.x / 2, size.y) / Math.tan(Three.MathUtils.degToRad(38 / 2)) + size.z;
    const camera = new Three.PerspectiveCamera(38, 2, 0.1, distance * 4);
    camera.position.copy(center).add(new Three.Vector3(distance * 0.1, distance * 0.6, -distance));
    camera.lookAt(center);
    const renderer = new Three.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1200, 600);
    renderer.render(scene, camera);
    document.body.replaceChildren(renderer.domElement);
    return {
      fixtures: definitions.map((definition) => definition.id),
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    };
  }, threeUrl);
  await page.screenshot({ path: out });
  console.log(JSON.stringify({ out, cost, errors }));
  if (errors.length > 0) {
    process.exitCode = 1;
  }
} finally {
  await browser?.close();
  await server.close();
}
