// biome-ignore-all lint/correctness/noNodejsModules: standalone browser contract starts Vite and Chrome
// biome-ignore-all lint/performance/noAwaitInLoops: post modes are tested sequentially against one running page
// biome-ignore-all lint/suspicious/noMisplacedAssertion: Node's test runner owns these assertions
import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './chromium.mjs';
import { gameUrl, inlineStartMod } from './gameUrl.mjs';
import { pressAction } from './input-actions.mjs';
import { browserStageUrl } from './stage-mode.mjs';
import { createStageServer } from './stageServer.mjs';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
const houseStart = {
  density: null,
  id: 'melee_build_click_house_start',
  kit: [
    { condition: 0.7, count: 1, destination: { kind: 'worn' }, id: 'jeans', item: 'jeans' },
    { condition: 0.8, count: 1, destination: { kind: 'worn' }, id: 'sneakers', item: 'sneakers' },
    { condition: 0.8, count: 1, destination: { kind: 'worn' }, id: 'hoodie', item: 'hoodie' },
    { destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 }, id: 'beans', item: 'canned_beans' },
    { destination: { kind: 'pocket', parent: 'hoodie', pocket: 0 }, id: 'matches', item: 'matches' },
    { count: 2, destination: { kind: 'pocket', parent: 'jeans', pocket: 2 }, id: 'bandages', item: 'bandage' },
  ],
  recipes: [
    'torch',
    'candle',
    'repair_kit',
    'repair_crowbar',
    'sawn_plank',
    'door_bar',
    'make_rope',
    'grind_kitchen_knife',
    'hone_kitchen_knife',
    'grind_kabar',
    'hone_kabar',
    'grind_machete',
    'hone_machete',
  ],
  seed: 1,
  site: 'testHouse',
  skills: {},
  startTimeGameTimeOfDay: '10:00',
  storeys: 1,
  wounds: [],
};
const observationPlugin = {
  name: 'melee-build-click-observation',
  enforce: 'pre',
  transform(code, id) {
    if (!id.endsWith('/src/presentation/play.ts')) {
      return;
    }
    const marker = '  const onForwardPress = (e: MouseEvent) => {';
    assert(code.includes(marker), 'game loop observation point is present');
    return code.replace(
      marker,
      `  Object.assign(globalThis, { d7Review: { input, session, held: view.held, engine, camera, debugTools, inventory } });\n${marker}`,
    );
  },
};
const vite = await createStageServer({
  root: projectRoot,
  configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
  logLevel: 'error',
  plugins: [observationPlugin],
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
try {
  await vite.listen();
  const address = vite.httpServer.address();
  assert(address && typeof address !== 'string');
  browser = await launchChromium('melee-build-click', { headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    browserStageUrl(
      'melee-build-click',
      gameUrl(`http://127.0.0.1:${address.port}`, {
        startMod: inlineStartMod('fixture.melee-build-click.house', houseStart),
        hash: { debug: true, seed: 73, radius: 16 },
      }),
    ),
    {
      waitUntil: 'domcontentloaded',
    },
  );
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
  await page.locator('#go').click();
  await page.waitForFunction(() => Boolean(globalThis.d7Review));
  await page.evaluate(() => {
    const runtime = globalThis.d7Review;
    globalThis.d7Observed = { starts: [] };
    const begin = runtime.session.playerCombat.beginMeleeSwing.bind(runtime.session.playerCombat);
    runtime.session.playerCombat.beginMeleeSwing = (start) => {
      const result = begin(start);
      globalThis.d7Observed.starts.push({ result, build: runtime.debugTools.buildOn });
      return result;
    };
  });

  await page.waitForFunction(() => globalThis.d7Review.input.locked && !globalThis.d7Review.input.menuPointer);
  await page.evaluate(() => {
    globalThis.d7Observed.starts = [];
    globalThis.d7Observed.buildStaminaBefore = globalThis.d7Review.session.sim.needs.stamina;
  });
  await pressAction(page, 'debug.build-toggle');
  assert.equal(await page.evaluate(() => globalThis.d7Review.debugTools.buildOn), true);
  const buildInputFrame = await page.evaluate(() => globalThis.d7Review.session.sim.time);
  await page.mouse.click(640, 360);
  await page.waitForFunction((before) => globalThis.d7Review.session.sim.time > before, buildInputFrame);
  const build = await page.evaluate(() => ({
    locked: globalThis.d7Review.input.locked,
    menu: globalThis.d7Review.input.menuPointer,
    build: globalThis.d7Review.debugTools.buildOn,
    starts: globalThis.d7Observed.starts,
    staminaBefore: globalThis.d7Observed.buildStaminaBefore,
    staminaAfter: globalThis.d7Review.session.sim.needs.stamina,
  }));
  await test('A native build-mode click is editor-only: no melee action and no stamina cost', () => {
    assert.equal(build.locked, true);
    assert.equal(build.menu, false);
    assert.equal(build.build, true);
    assert.deepEqual(build.starts, []);
    assert.equal(build.staminaAfter, build.staminaBefore);
  });

  const downwardFrame = await page.evaluate(() => {
    globalThis.d7Review.input.controls.pitch = -Math.PI / 2;
    return globalThis.d7Review.session.sim.time;
  });
  await page.waitForFunction((before) => globalThis.d7Review.session.sim.time > before, downwardFrame);
  await pressAction(page, 'debug.build-damage');
  await page.waitForFunction(() => globalThis.d7Review.engine.world.blockDamage.snapshotState().entries.length > 0);
  const damaged = await page.evaluate(async (numberTextModule) => {
    const { world, registry } = globalThis.d7Review.engine;
    const [entry] = world.blockDamage.snapshotState().entries;
    const block = registry.blocks[world.getBlock(...entry.cell)];
    const material = registry.blockMaterials.get(block.material);
    const { decimalText } = await import(numberTextModule);
    globalThis.d7ToolDamage = { ...entry, text: decimalText(entry.damage) };
    return { damage: entry.damage, durability: material.durability, solid: block.solid };
  }, '/@stage/@skelly/engine/internal/core/numberText.ts');
  await page.waitForFunction(() => document.querySelector('#hud').textContent.includes(globalThis.d7ToolDamage.text));
  await pressAction(page, 'debug.build-destroy');
  await page.waitForFunction(() => globalThis.d7Review.engine.world.getBlock(...globalThis.d7ToolDamage.cell) === 0);
  const tool = await page.evaluate(() => ({
    remainingDamage: globalThis.d7Review.engine.world.blockDamage.get(globalThis.d7ToolDamage.cell),
    starts: globalThis.d7Observed.starts,
  }));
  await test('Gated build strike keys show stored partial damage and remove terrain without a melee swing', () => {
    assert.equal(damaged.solid, true);
    assert.ok(damaged.damage > 0 && damaged.damage < damaged.durability);
    assert.equal(tool.remainingDamage, undefined);
    assert.deepEqual(tool.starts, []);
  });

  await pressAction(page, 'debug.build-toggle');
  assert.equal(await page.evaluate(() => globalThis.d7Review.debugTools.buildOn), false);
  const meleeAdded = await page.evaluate(() => {
    const { inventory } = globalThis.d7Review;
    return inventory.add(inventory.create('kitchen_knife'), { kind: 'hand', side: 'right' });
  });
  assert.equal(meleeAdded, true, 'positive control has a held melee weapon');
  await page.evaluate(() => {
    globalThis.d7Observed.starts = [];
    globalThis.d7Observed.combatStaminaBefore = globalThis.d7Review.session.sim.needs.stamina;
  });
  await page.mouse.down({ button: 'right' });
  await page.waitForFunction(() => globalThis.d7Review.input.controls.rightMouseActionHeld);
  await page.mouse.click(640, 360);
  await page.waitForFunction(() => globalThis.d7Observed.starts.length > 0);
  await page.mouse.up({ button: 'right' });
  const combat = await page.evaluate(() => ({
    starts: globalThis.d7Observed.starts,
    staminaBefore: globalThis.d7Observed.combatStaminaBefore,
    staminaAfter: globalThis.d7Review.session.sim.needs.stamina,
  }));
  await test('A native combat click with a melee weapon starts one attack and spends stamina (positive control)', () => {
    assert.equal(combat.starts.length, 1);
    assert.equal(combat.starts[0].result, true);
    assert.equal(combat.starts[0].build, false);
    assert.ok(combat.staminaAfter < combat.staminaBefore);
  });

  await page.waitForFunction(() => !globalThis.d7Review.session.playerCombat.activeMeleeAction, null, {
    timeout: 10_000,
  });
  await page.evaluate(() => {
    globalThis.d7Observed.starts = [];
  });
  await pressAction(page, 'ui.inventory-toggle');
  assert.equal(
    await page.evaluate(() => globalThis.d7Review.input.menuPointer && !document.querySelector('#inventory').hidden),
    true,
  );
  const menuInputFrame = await page.evaluate(() => globalThis.d7Review.session.sim.time);
  await page.mouse.click(640, 360);
  await pressAction(page, 'ui.inventory-toggle');
  await page.waitForFunction((before) => globalThis.d7Review.session.sim.time > before, menuInputFrame);
  const menu = await page.evaluate(() => ({
    locked: globalThis.d7Review.input.locked,
    menu: globalThis.d7Review.input.menuPointer,
    starts: globalThis.d7Observed.starts,
  }));
  await test('A canvas click consumed by the inventory cannot become an attack after Tab closes it', () => {
    assert.equal(menu.locked, true);
    assert.equal(menu.menu, false);
    assert.deepEqual(menu.starts, []);
  });
  await test('Native observation run produces no application errors', () => assert.deepEqual(errors, []));
} finally {
  await browser?.close();
  await vite.close();
}
