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
import { gameUrl, minimumViewRadiusM, stageLookBaseline } from './gameUrl.mjs';
import { pressAction } from './input-actions.mjs';
import { waitForSimulation } from './simulation-wait.mjs';
import { browserStageUrl } from './stage-mode.mjs';
import { createStageServer, listeningPort } from './stageServer.mjs';

/**
 * @import { Vec3 } from '@skelly/engine/world'
 */

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const artifacts = resolve(projectRoot, process.env.CELL_REPAIR_CRACK_ARTIFACT_DIR ?? 'test-results/cell-repair-crack');

// The damaged cell's on-screen box and the crack overlay's vertex count; the start ships exactly one damaged cell.
const crackView = () => {
  const { engine } = globalThis.skellyPlayTest;
  const { entries } = engine.simulationWorld.blockDamage.snapshotState();
  /** @param {import('three').Object3D | undefined} object @returns {object is import('three').Mesh} */
  const isMesh = (object) => object?.type === 'Mesh';
  const overlay = engine.scene.getObjectByName('terrain-cracks');
  if (!isMesh(overlay)) {
    throw new Error('The scene has no terrain-cracks mesh');
  }
  const vertices = overlay.geometry.attributes.position?.count ?? 0;
  const [entry] = entries;
  if (entries.length !== 1 || !entry) {
    return { cell: entry?.cell, damaged: entries.length, vertices };
  }
  const { cell } = entry;
  const view = document.querySelector('#view canvas');
  if (!(view instanceof HTMLCanvasElement)) {
    throw new Error('No #view canvas is on the page');
  }
  const canvas = view.getBoundingClientRect();
  const s = engine.config.scale.blockSize;
  const { camera } = engine;
  camera.updateMatrixWorld(true);
  const xs = [];
  const ys = [];
  const [x, y, z] = cell;
  for (const corner of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const point = camera.position
      .clone()
      .set((x + (corner & 1)) * s, (y + ((corner >> 1) & 1)) * s, (z + ((corner >> 2) & 1)) * s);
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
const drawn = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done(undefined))));

/** @param {boolean} shown */
const setOverlayShown = (shown) => {
  const overlay = globalThis.skellyPlayTest.engine.scene.getObjectByName('terrain-cracks');
  if (!overlay) {
    throw new Error('The scene has no terrain-cracks overlay');
  }
  overlay.visible = shown;
};

// The share of a crop's pixels darker than half its median brightness: the crack is far darker than brick, so the
// share rises with the crack drawn and a frame-to-frame sway of the view barely moves it.
/** @param {string} base64 */
const darkShare = (base64) =>
  (async () => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('The canvas has no 2D context');
    }
    context.drawImage(image, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const light = [];
    for (let at = 0; at < data.length; at += 4) {
      light.push(data.subarray(at, at + 3).reduce((sum, channel) => sum + channel, 0));
    }
    const median = light.toSorted((a, b) => a - b)[light.length >> 1];
    if (median === undefined) {
      throw new Error('The crop has no pixels');
    }
    return light.filter((value) => value < median / 2).length / light.length;
  })();

/** @param {string[]} types */
const carriedCounts = (types) => {
  const { inventory } = globalThis.skellyPlayTest.session;
  const counts = Object.fromEntries(types.map((type) => [type, 0]));
  for (const { item } of inventory.carriedTree()) {
    if (Object.hasOwn(counts, item.type)) {
      counts[item.type] = (counts[item.type] ?? 0) + item.count;
    }
  }
  return counts;
};

const vite = await createStageServer({
  root: projectRoot,
  configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
// A hung wait ends at the CI step's timeout; the last phase line names the stuck wait.
/** @param {string} name */
const phase = (name) => process.stdout.write(`CELL_REPAIR_CRACK_PHASE ${name}\n`);
let browser;
try {
  await vite.listen();
  const port = listeningPort(vite);
  browser = await launchChromium('cell-repair-crack', { headless: true, args: ['--enable-webgl'] });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  // A software-rendered frame scales with machine load; the CI step's timeout bounds a hung wait instead.
  page.setDefaultTimeout(0);
  /** @type {string[]} */
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
      gameUrl(`http://127.0.0.1:${port}`, {
        startMod: 'skelly.deadvox.scenario.test-house.cell-repair-look',
        harness: { 'play-test': 1 },
        // Film grain redraws every pixel each frame, so post stays off for a stable comparison.
        hash: { ...stageLookBaseline, debug: true, seed: 73, radius: minimumViewRadiusM, post: false },
      }),
    ),
    { waitUntil: 'domcontentloaded' },
  );
  phase('menu');
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
  await page.locator('#go').click();
  phase('enter');
  await page.waitForFunction(() => Boolean(globalThis.skellyPlayTest));
  phase('pointer-lock');
  await page.waitForFunction(
    () => globalThis.skellyPlayTest.input.locked && !globalThis.skellyPlayTest.input.menuPointer,
  );
  phase('world-ready');
  await page.waitForFunction(() => {
    const mask = document.querySelector('#world-loading');
    return mask instanceof HTMLElement && mask.dataset.state === 'ready' && mask.hidden;
  });
  phase('crack-overlay');
  await page.waitForFunction(() => {
    /** @param {import('three').Object3D | undefined} object @returns {object is import('three').Mesh} */
    const isMesh = (object) => object?.type === 'Mesh';
    const overlay = globalThis.skellyPlayTest.engine.scene.getObjectByName('terrain-cracks');
    return isMesh(overlay) && (overlay.geometry.attributes.position?.count ?? 0) > 0;
  });
  await page.evaluate(drawn);
  await mkdir(artifacts, { recursive: true });

  const before = await page.evaluate(crackView);
  assert.equal(before.damaged, 1, 'the start ships one damaged cell');
  const { cell: damagedCell, clip } = before;
  assert.ok(damagedCell && clip, 'the damaged cell has an on-screen box');
  assert.ok(clip.width > 0 && clip.height > 0, 'the damaged cell is on screen');
  const shownShot = await page.screenshot({ clip });
  await writeFile(resolve(artifacts, 'crack-before-repair.png'), shownShot);
  await page.evaluate(setOverlayShown, false);
  await page.evaluate(drawn);
  const hiddenShot = await page.screenshot({ clip });
  await page.evaluate(setOverlayShown, true);
  const shown = await page.evaluate(darkShare, shownShot.toString('base64'));
  const hidden = await page.evaluate(darkShare, hiddenShot.toString('base64'));
  process.stdout.write(`CELL_REPAIR_CRACK before ${JSON.stringify({ ...before, shown, hidden })}\n`);
  await test('A start-damaged brick shows its crack on screen', () => {
    assert.ok(before.vertices > 0, 'the crack overlay has geometry');
    assert.ok(shown - hidden > 0.005, 'the crack darkens a visible share of the brick');
  });

  // The condition one repair tops out at, read from content as the engine reads it (`repairCeiling`), and the cell's
  // condition from its damage and its material's durability.
  const recipe = await page.evaluate((cell) => {
    const { registry, world } = globalThis.skellyPlayTest.engine;
    const repairBrick = registry.recipes.get('repair_brick');
    const tuning = [...registry.inventory.values()].find((row) => row.capability === 'player');
    if (!(repairBrick?.repair && tuning)) {
      throw new Error('Content lacks the brick repair recipe or the player inventory tuning');
    }
    const { components, qualities, timeGameMinutes } = repairBrick;
    const ceilingWord = repairBrick.repair.ceiling ?? tuning.repairCeiling;
    const band = tuning.conditionBands.findIndex(({ word }) => word === ceilingWord);
    const ceilingBand = tuning.conditionBands[band];
    const [x, y, z] = cell;
    const block = registry.blocks[world.getBlock(x, y, z)];
    const material = block && registry.blockMaterials.get(block.material);
    if (!(ceilingBand && material)) {
      throw new Error('The repair ceiling or the damaged cell’s material is missing from content');
    }
    return {
      components: components.flat().map((component) => {
        if (!('item' in component)) {
          throw new Error('The brick repair recipe takes a component that is not an item');
        }
        return component;
      }),
      qualities,
      timeGameMinutes,
      ceiling: band === tuning.conditionBands.length - 1 ? 1 : ceilingBand.from,
      durability: material.durability,
    };
  }, damagedCell);
  /**
   * @param {Vec3} target
   * @param {number} durability
   */
  const conditionOf = (target, durability) =>
    page.evaluate(
      ({ at, points }) =>
        1 - (globalThis.skellyPlayTest.engine.simulationWorld.blockDamage.get(at)?.damage ?? 0) / points,
      { at: target, points: durability },
    );
  const conditionBefore = await conditionOf(damagedCell, recipe.durability);
  const tracked = [...new Set([...recipe.components.map(({ item }) => item), 'repair_kit'])];
  const kitBefore = await page.evaluate(carriedCounts, tracked);
  await pressAction(page, 'debug.build-toggle');
  assert.equal(await page.evaluate(() => globalThis.skellyPlayTest.debugTools?.buildOn), true);
  await pressAction(page, 'debug.repair-cell');
  await page.waitForFunction(() => globalThis.skellyPlayTest.session.sim.actions.job?.jobType === 'craft');
  await waitForSimulation(
    page,
    ({ cell, ceiling, durability }) => {
      const { session, engine } = globalThis.skellyPlayTest;
      const condition = 1 - (engine.simulationWorld.blockDamage.get(cell)?.damage ?? 0) / durability;
      return {
        time: session.sim.time,
        paused: session.sim.paused,
        reached: condition >= ceiling && session.sim.actions.job === undefined,
        job: session.sim.actions.job,
        compression: session.sim.compression.c,
      };
    },
    { cell: damagedCell, ceiling: recipe.ceiling, durability: recipe.durability },
    {
      // Twice the recipe's own time, so tuning the recipe never fails the stage.
      seconds: recipe.timeGameMinutes * 60 * 2,
      label: 'the repair completes in simulated time',
      record: (line) => process.stdout.write(`CELL_REPAIR_CRACK ${line}\n`),
    },
  );
  await pressAction(page, 'debug.build-toggle');
  await page.waitForFunction(() => {
    /** @param {import('three').Object3D | undefined} object @returns {object is import('three').Mesh} */
    const isMesh = (object) => object?.type === 'Mesh';
    const overlay = globalThis.skellyPlayTest.engine.scene.getObjectByName('terrain-cracks');
    if (!isMesh(overlay)) {
      throw new Error('The scene has no terrain-cracks mesh');
    }
    return (overlay.geometry.attributes.position?.count ?? 0) === 0;
  });
  await page.evaluate(drawn);
  const after = await page.evaluate(crackView);
  const conditionAfter = await conditionOf(damagedCell, recipe.durability);
  const kitAfter = await page.evaluate(carriedCounts, tracked);
  const repairedShot = await page.screenshot({ clip });
  await writeFile(resolve(artifacts, 'crack-after-repair.png'), repairedShot);
  const repaired = await page.evaluate(darkShare, repairedShot.toString('base64'));
  process.stdout.write(
    `CELL_REPAIR_CRACK after ${JSON.stringify({ ...after, conditionBefore, conditionAfter, repaired, kitBefore, kitAfter })}\n`,
  );
  await test('Repairing through the debug build keys mends the cell to its repair ceiling and spends its components', () => {
    assert.ok(conditionBefore < recipe.ceiling, 'the start damages the brick below the repair ceiling');
    assert.ok(conditionAfter >= recipe.ceiling, 'one repair lifts the brick to the ceiling');
    if (recipe.ceiling < 1) {
      assert.ok(conditionAfter < 1, 'the ceiling caps the repair short of full condition');
    }
    for (const { item, count } of recipe.components) {
      const carried = kitBefore[item];
      assert.ok(carried !== undefined, `the kit counts track ${item}`);
      assert.equal(kitAfter[item], carried - count, `the repair spends its ${item}`);
    }
    assert.equal(kitAfter.repair_kit, kitBefore.repair_kit, 'the repair kit is a tool, kept after the repair');
  });
  await test('The brick mended to its repair ceiling shows no crack', () => {
    assert.equal(after.vertices, 0, 'the crack overlay is empty');
    assert.ok(repaired - hidden < (shown - hidden) / 4, 'the brick reads as it did with the crack hidden');
  });
  await test('The run produces no application errors', () => assert.deepEqual(errors, []));
} finally {
  await browser?.close();
  await vite.close();
}
