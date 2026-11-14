// biome-ignore-all lint/correctness/noNodejsModules: standalone browser contract starts Vite and Chrome
// biome-ignore-all lint/suspicious/noMisplacedAssertion: Node's test runner owns these assertions
// biome-ignore-all lint/style/noProcessEnv: the runner chooses where the screenshots land
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './chromium.mjs';
import { gameUrl } from './gameUrl.mjs';
import { pressAction } from './input-actions.mjs';
import { waitForSimulation } from './simulation-wait.mjs';
import { browserStageUrl } from './stage-mode.mjs';
import { createStageServer } from './stageServer.mjs';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const artifacts = resolve(projectRoot, process.env.CELL_REPAIR_CRACK_ARTIFACT_DIR ?? 'test-results/cell-repair-crack');
const observationPlugin = {
  name: 'cell-repair-crack-observation',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/src/presentation/play.ts')) {
      return;
    }
    const marker = '  const onForwardPress = (e: MouseEvent) => {';
    assert(code.includes(marker), 'game loop observation point is present');
    return code.replace(
      marker,
      `  Object.assign(globalThis, { cellRepairCrack: { input, session, engine, debugTools, inventory } });\n${marker}`,
    );
  },
};

// The damaged cell's on-screen box and the crack overlay's vertex count; the start ships exactly one damaged cell.
const crackView = () => {
  const { engine } = globalThis.cellRepairCrack;
  const { entries } = engine.world.blockDamage.snapshotState();
  const overlay = engine.scene.getObjectByName('terrain-cracks');
  const vertices = overlay.geometry.attributes.position?.count ?? 0;
  if (entries.length !== 1) {
    return { cell: entries[0]?.cell, damaged: entries.length, vertices };
  }
  const [{ cell }] = entries;
  const canvas = document.querySelector('#view canvas').getBoundingClientRect();
  const s = engine.config.scale.blockSize;
  const { camera } = engine;
  camera.updateMatrixWorld(true);
  const xs = [];
  const ys = [];
  for (const corner of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const offsets = [corner & 1, (corner >> 1) & 1, (corner >> 2) & 1];
    const point = camera.position.clone().set(...cell.map((at, axis) => (at + offsets[axis]) * s));
    point.project(camera);
    xs.push(canvas.left + ((point.x + 1) / 2) * canvas.width);
    ys.push(canvas.top + ((1 - point.y) / 2) * canvas.height);
  }
  const left = Math.max(canvas.left, Math.min(...xs));
  const top = Math.max(canvas.top, Math.min(...ys));
  const right = Math.min(canvas.right, Math.max(...xs));
  const bottom = Math.min(canvas.bottom, Math.max(...ys));
  return {
    cell,
    damaged: 1,
    vertices,
    clip: {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(right - left),
      height: Math.round(bottom - top),
    },
  };
};

// Waits until a frame has been drawn after the caller's change, so the next screenshot shows it.
const drawn = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));

const setOverlayShown = (shown) => {
  globalThis.cellRepairCrack.engine.scene.getObjectByName('terrain-cracks').visible = shown;
};

// The share of a crop's pixels darker than half its median brightness: the crack is far darker than brick, so the
// share rises with the crack drawn and a frame-to-frame sway of the view barely moves it.
const darkShare = (base64) =>
  (async () => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const light = [];
    for (let at = 0; at < data.length; at += 4) {
      light.push(data[at] + data[at + 1] + data[at + 2]);
    }
    const median = light.toSorted((a, b) => a - b)[light.length >> 1];
    return light.filter((value) => value < median / 2).length / light.length;
  })();

const carriedCounts = (types) => {
  const { inventory } = globalThis.cellRepairCrack;
  const counts = Object.fromEntries(types.map((type) => [type, 0]));
  for (const { item } of inventory.carriedTree()) {
    if (Object.hasOwn(counts, item.type)) {
      counts[item.type] += item.count;
    }
  }
  return counts;
};

const vite = await createStageServer({
  root: projectRoot,
  configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
  logLevel: 'error',
  plugins: [observationPlugin],
  server: { host: '127.0.0.1', port: 0 },
});
// A hung wait ends at the CI step's timeout; the last phase line names the stuck wait.
const phase = (name) => process.stdout.write(`CELL_REPAIR_CRACK_PHASE ${name}\n`);
let browser;
try {
  await vite.listen();
  const address = vite.httpServer.address();
  assert(address && typeof address !== 'string');
  browser = await launchChromium('cell-repair-crack', { headless: true, args: ['--enable-webgl'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  // A software-rendered frame scales with machine load; the CI step's timeout bounds a hung wait instead.
  page.setDefaultTimeout(0);
  const errors = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
    process.stdout.write(`PAGE_ERROR ${error.stack}\n`);
  });
  // The HUD's text and panels change between the shots; only the world's pixels are compared.
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const hudless = document.createElement('style');
      hudless.textContent = '#hud, #quickbar, #prompt { visibility: hidden }';
      document.head.append(hudless);
    });
  });
  await page.goto(
    browserStageUrl(
      'cell-repair-crack',
      gameUrl(`http://127.0.0.1:${address.port}`, {
        startMod: 'skelly.deadvox.scenario.test-house.cell-repair-look',
        // Film grain redraws every pixel each frame, so post stays off for a stable comparison.
        hash: { debug: true, seed: 73, radius: 16, post: false },
      }),
    ),
    { waitUntil: 'domcontentloaded' },
  );
  phase('menu');
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
  await page.locator('#go').click();
  phase('enter');
  await page.waitForFunction(() => Boolean(globalThis.cellRepairCrack));
  phase('pointer-lock');
  await page.waitForFunction(
    () => globalThis.cellRepairCrack.input.locked && !globalThis.cellRepairCrack.input.menuPointer,
  );
  phase('world-ready');
  await page.waitForFunction(() => {
    const mask = document.querySelector('#world-loading');
    return mask?.dataset.state === 'ready' && mask.hidden;
  });
  phase('crack-overlay');
  await page.waitForFunction(
    () =>
      (globalThis.cellRepairCrack.engine.scene.getObjectByName('terrain-cracks')?.geometry.attributes.position?.count ??
        0) > 0,
  );
  await page.evaluate(drawn);
  await mkdir(artifacts, { recursive: true });

  const before = await page.evaluate(crackView);
  assert.equal(before.damaged, 1, 'the start ships one damaged cell');
  assert.ok(before.clip.width > 0 && before.clip.height > 0, 'the damaged cell is on screen');
  const shownShot = await page.screenshot({ clip: before.clip });
  await writeFile(resolve(artifacts, 'crack-before-repair.png'), shownShot);
  await page.evaluate(setOverlayShown, false);
  await page.evaluate(drawn);
  const hiddenShot = await page.screenshot({ clip: before.clip });
  await page.evaluate(setOverlayShown, true);
  const shown = await page.evaluate(darkShare, shownShot.toString('base64'));
  const hidden = await page.evaluate(darkShare, hiddenShot.toString('base64'));
  process.stdout.write(`CELL_REPAIR_CRACK before ${JSON.stringify({ ...before, shown, hidden })}\n`);
  await test('A start-damaged brick shows its crack on screen', () => {
    assert.ok(before.vertices > 0, 'the crack overlay has geometry');
    assert.ok(shown - hidden > 0.005, 'the crack darkens a visible share of the brick');
  });

  const recipe = await page.evaluate(() => {
    const { registry } = globalThis.cellRepairCrack.engine;
    const { components, qualities, timeGameMinutes } = registry.recipes.get('repair_brick');
    return { components: components.flat(), qualities, timeGameMinutes };
  });
  const tracked = [...new Set([...recipe.components.map(({ item }) => item), 'repair_kit'])];
  const kitBefore = await page.evaluate(carriedCounts, tracked);
  await pressAction(page, 'debug.build-toggle');
  assert.equal(await page.evaluate(() => globalThis.cellRepairCrack.debugTools.buildOn), true);
  await pressAction(page, 'debug.repair-cell');
  await page.waitForFunction(() => globalThis.cellRepairCrack.session.sim.actions.job?.jobType === 'craft');
  await waitForSimulation(
    page,
    (cell) => {
      const { session, engine } = globalThis.cellRepairCrack;
      return {
        time: session.sim.time,
        paused: session.sim.paused,
        reached: engine.world.blockDamage.get(cell) === undefined && session.sim.actions.job === undefined,
        job: session.sim.actions.job,
        compression: session.sim.compression.c,
      };
    },
    before.cell,
    {
      // Twice the recipe's own time, so tuning the recipe never fails the stage.
      seconds: recipe.timeGameMinutes * 60 * 2,
      label: 'the repair completes in simulated time',
      record: (line) => process.stdout.write(`CELL_REPAIR_CRACK ${line}\n`),
    },
  );
  await pressAction(page, 'debug.build-toggle');
  await page.waitForFunction(
    () =>
      (globalThis.cellRepairCrack.engine.scene.getObjectByName('terrain-cracks').geometry.attributes.position?.count ??
        0) === 0,
  );
  await page.evaluate(drawn);
  const after = await page.evaluate(crackView);
  const kitAfter = await page.evaluate(carriedCounts, tracked);
  const repairedShot = await page.screenshot({ clip: before.clip });
  await writeFile(resolve(artifacts, 'crack-after-repair.png'), repairedShot);
  const repaired = await page.evaluate(darkShare, repairedShot.toString('base64'));
  process.stdout.write(`CELL_REPAIR_CRACK after ${JSON.stringify({ ...after, repaired, kitBefore, kitAfter })}\n`);
  await test('Repairing through the debug build keys mends the cell and spends its components', () => {
    assert.equal(after.damaged, 0, 'the cell has no damage entry');
    for (const { item, count } of recipe.components) {
      assert.equal(kitAfter[item], kitBefore[item] - count, `the repair spends its ${item}`);
    }
    assert.equal(kitAfter.repair_kit, kitBefore.repair_kit, 'the repair kit is a tool, kept after the repair');
  });
  await test('The mended brick shows no crack', () => {
    assert.equal(after.vertices, 0, 'the crack overlay is empty');
    assert.ok(repaired - hidden < (shown - hidden) / 4, 'the brick reads as it did with the crack hidden');
  });
  await test('The run produces no application errors', () => assert.deepEqual(errors, []));
} finally {
  await browser?.close();
  await vite.close();
}
