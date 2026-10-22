// biome-ignore-all lint/correctness/noNodejsModules: dev tool starts Vite and writes a screenshot
// biome-ignore-all lint/suspicious/noConsole: CLI evidence goes to stdout
import { readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { launchChromium } from '../test/browser/chromium.mjs';

const [out, ...rest] = process.argv.slice(2);
const compare = rest[0] === '--compare';
const only = compare ? rest.slice(1) : rest;
if (!out || (rest.includes('--compare') && !compare)) {
  throw new Error('usage: node tools/furniture-detail-probe.mjs <screenshot.png> [--compare] [furniture id ...]');
}
// Hoisting puts three outside this project, so the page loads it by absolute path through Vite.
const threeFile = createRequire(import.meta.url)
  .resolve('three')
  .replace(/three\.cjs$/, 'three.module.js');
const threeUrl = `/@fs${threeFile}`;
// Every base content file may hold detailed fixtures; the page function is serialised, so the list is made here.
const contentDir = fileURLToPath(new URL('../src/content/base/', import.meta.url));
const contentFiles = (await readdir(contentDir)).filter((file) => file.endsWith('.json')).sort();
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
  const cost = await page.evaluate(
    async ({ threeModule, contentNames, ids, withPlain }) => {
      const Three = await import(new URL(threeModule, location.href).href);
      const { buildRegistry } = await import(new URL('/src/core/content.ts', location.href).href);
      const { BlockEntities } = await import(new URL('/src/core/blockEntities.ts', location.href).href);
      const { FurnitureMeshes } = await import(new URL('/src/render/furniture.ts', location.href).href);
      const files = await Promise.all(
        contentNames.map(
          async (file) => (await import(new URL(`/src/content/base/${file}`, location.href).href)).default,
        ),
      );
      const gather = (key) => files.flatMap((file) => file[key] ?? []);
      // Rows run away from the camera, so the short pieces stand in front where tall ones cannot hide them.
      const definitions = gather('furniture')
        .filter((definition) => definition.appearance && (ids.length === 0 || ids.includes(definition.id)))
        .map(({ loot, ...definition }) => definition)
        .sort((a, b) => a.size[1] - b.size[1]);
      if (definitions.length === 0) {
        throw new Error('no appearance fixtures to inspect');
      }
      // A compare run stands the plain block each fixture drew before its detail at the head of its row.
      const plain = withPlain
        ? definitions.map(({ appearance, ...definition }) => ({ ...definition, id: `${definition.id}_plain` }))
        : [];
      const { registry, issues } = buildRegistry([
        {
          source: 'look.json',
          data: {
            sounds: gather('sounds'),
            furnitureMaterials: gather('furnitureMaterials'),
            furniture: [...plain, ...definitions],
          },
        },
      ]);
      if (issues.length > 0) {
        throw new Error(JSON.stringify(issues));
      }
      // Each fixture stands intact at the left of its row, then once at the start of each of its material's damage steps;
      // the camera looks along +z, so a row runs toward -x to read left to right.
      const entities = new BlockEntities(registry);
      const damage = new Map();
      const place = (definition, pos) => {
        const piece = entities.add({ type: definition.id, size: definition.size, pos, facing: 'n' });
        if (!piece) {
          throw new Error(`could not place ${definition.id}`);
        }
        return piece;
      };
      const placeRow = (definition, before, row) => {
        const steps = registry.furnitureMaterials.get(definition.material)?.damaged ?? [];
        let x = 0;
        if (before) {
          place(before, [x, 0, row]);
          x -= before.size[0] + 2;
        }
        for (const fraction of [0, ...steps.map((step) => step.from)]) {
          const piece = place(definition, [x, 0, row]);
          if (fraction > 0) {
            damage.set(piece.uid, fraction * definition.breach.durability);
          }
          x -= definition.size[0] + 1;
        }
      };
      let z = 0;
      for (const [index, definition] of definitions.entries()) {
        placeRow(definition, plain[index], z);
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
      const halfFov = Math.tan(Three.MathUtils.degToRad(38 / 2));
      const distance = (Math.max(size.x / 4, size.y / 2) / halfFov + size.z) * 1.1;
      const camera = new Three.PerspectiveCamera(38, 2, 0.1, distance * 4);
      camera.position.copy(center).add(new Three.Vector3(0.1, 0.6, -1).setLength(distance));
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
    },
    { threeModule: threeUrl, contentNames: contentFiles, ids: only, withPlain: compare },
  );
  await page.screenshot({ path: out });
  console.log(JSON.stringify({ out, cost, errors }));
  if (errors.length > 0) {
    process.exitCode = 1;
  }
} finally {
  await browser?.close();
  await server.close();
}
