// biome-ignore-all lint/correctness/noNodejsModules: standalone browser contract starts Vite and Chrome
// biome-ignore-all lint/style/noProcessEnv: the quarantine of the build-strike block reads the CI marker
// biome-ignore-all lint/performance/noAwaitInLoops: post modes are tested sequentially against one running page
// biome-ignore-all lint/suspicious/noMisplacedAssertion: Node's test runner owns these assertions
import assert from 'node:assert/strict';
import process from 'node:process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { launchChromium } from './chromium.mjs';
import { gameUrl } from './gameUrl.mjs';
import { pressAction, tapAction } from './input-actions.mjs';
import { waitForSimulation } from './simulation-wait.mjs';
import { browserStageUrl } from './stage-mode.mjs';
import { createStageServer, listeningPort } from './stageServer.mjs';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
// Each group loads its own world under its own CI step bound, so one step's startup and checks fit with headroom.
const groups = ['window', 'native-inputs'];
const [, , group] = process.argv;
assert(group !== undefined && groups.includes(group), `usage: melee-build-click.mjs <${groups.join('|')}>`);
const vite = await createStageServer({
  root: projectRoot,
  configFile: fileURLToPath(new URL('../../vite.config.ts', import.meta.url)),
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
});
// The step's bound covers every phase; the log's timestamps on these lines show which one spends it.
/** @param {string} name */
const phase = (name) => process.stdout.write(`MELEE_BUILD_CLICK_PHASE ${name}\n`);
let browser;
try {
  phase('server');
  await vite.listen();
  const port = listeningPort(vite);
  phase('browser-launch');
  browser = await launchChromium('melee-build-click', { headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  /** @type {string[]} */
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  phase('menu');
  await page.goto(
    browserStageUrl(
      'melee-build-click',
      gameUrl(`http://127.0.0.1:${port}`, {
        startMod: 'skelly.deadvox.scenario.test-house.window-look',
        harness: { 'play-test': 1 },
        hash: { debug: true, seed: 73, radius: 16 },
      }),
    ),
    {
      waitUntil: 'domcontentloaded',
    },
  );
  await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
  phase('enter');
  await page.locator('#go').click();
  await page.waitForFunction(() => Boolean(globalThis.skellyPlayTest));
  phase('play-handle');
  await page.evaluate(() => {
    const runtime = globalThis.skellyPlayTest;
    const { debugTools } = runtime;
    if (!debugTools) {
      throw new Error('The melee stage needs a debug run');
    }
    globalThis.d7Observed = { starts: [] };
    const begin = runtime.session.playerCombat.beginMeleeSwing.bind(runtime.session.playerCombat);
    runtime.session.playerCombat.beginMeleeSwing = (start) => {
      const result = begin(start);
      globalThis.d7Observed.starts.push({
        result,
        build: debugTools.buildOn,
        armed: start.profile !== 'fists',
      });
      return result;
    };
  });

  await page.waitForFunction(
    () => globalThis.skellyPlayTest.input.locked && !globalThis.skellyPlayTest.input.menuPointer,
  );
  phase('pointer-locked');
  const checkNativeInputs = async () => {
    phase('build-click');
    await page.evaluate(() => {
      globalThis.d7Observed.starts = [];
      globalThis.d7Observed.buildStaminaBefore = globalThis.skellyPlayTest.session.sim.needs.stamina;
    });
    await pressAction(page, 'debug.build-toggle');
    assert.equal(await page.evaluate(() => globalThis.skellyPlayTest.debugTools?.buildOn), true);
    const buildInputFrame = await page.evaluate(() => globalThis.skellyPlayTest.session.sim.time);
    await page.mouse.click(640, 360);
    await page.waitForFunction((before) => globalThis.skellyPlayTest.session.sim.time > before, buildInputFrame);
    const build = await page.evaluate(() => ({
      locked: globalThis.skellyPlayTest.input.locked,
      menu: globalThis.skellyPlayTest.input.menuPointer,
      build: globalThis.skellyPlayTest.debugTools?.buildOn,
      starts: globalThis.d7Observed.starts,
      staminaBefore: globalThis.d7Observed.buildStaminaBefore,
      staminaAfter: globalThis.skellyPlayTest.session.sim.needs.stamina,
    }));
    await test('A native build-mode click is editor-only: no melee action and no stamina cost', () => {
      assert.equal(build.locked, true);
      assert.equal(build.menu, false);
      assert.equal(build.build, true);
      assert.deepEqual(build.starts, []);
      assert.ok(build.staminaBefore !== undefined, 'stamina was read before the click');
      assert.ok(
        build.staminaAfter >= build.staminaBefore,
        'editor input cannot spend stamina while recovery continues',
      );
    });

    // Skipped in CI until #1791: a wait in this block timed out once with no cause found; it still runs locally.
    if (process.env.GITHUB_ACTIONS !== 'true') {
      const downwardFrame = await page.evaluate(() => {
        // Break adjacent flooring, not our footing or the pane needed by the later window check.
        globalThis.skellyPlayTest.input.controls.yaw += Math.PI / 2;
        globalThis.skellyPlayTest.input.controls.pitch = -Math.PI / 3;
        return globalThis.skellyPlayTest.session.sim.time;
      });
      await page.waitForFunction((before) => globalThis.skellyPlayTest.session.sim.time > before, downwardFrame);
      await pressAction(page, 'debug.build-damage');
      await page.waitForFunction(
        () => globalThis.skellyPlayTest.engine.simulationWorld.blockDamage.snapshotState().entries.length > 0,
      );
      const damaged = await page.evaluate(async (numberTextModule) => {
        const { simulationWorld: world, registry } = globalThis.skellyPlayTest.engine;
        const [entry] = world.blockDamage.snapshotState().entries;
        if (!entry) {
          throw new Error('The build strike stored no block damage');
        }
        const blockId = world.getBlock(...entry.cell);
        if (typeof blockId !== 'number') {
          throw new Error('The damaged cell is not loaded');
        }
        const block = registry.blocks[blockId];
        if (!block) {
          throw new Error('The damaged cell holds no registered block');
        }
        const material = registry.blockMaterials.get(block.material);
        if (!material) {
          throw new Error(`Block material ${block.material} is not registered`);
        }
        const { decimalText } = await import(numberTextModule);
        globalThis.d7ToolDamage = { ...entry, text: decimalText(entry.damage) };
        return { damage: entry.damage, durability: material.durability, solid: block.solid };
      }, '/@stage/@skelly/engine/internal/core/numberText.ts');
      await page.waitForFunction(() =>
        Boolean(document.querySelector('#hud')?.textContent.includes(globalThis.d7ToolDamage.text)),
      );
      await pressAction(page, 'debug.build-destroy');
      await page.waitForFunction(
        () => globalThis.skellyPlayTest.engine.simulationWorld.getBlock(...globalThis.d7ToolDamage.cell) === 0,
      );
      const tool = await page.evaluate(() => ({
        remainingDamage: globalThis.skellyPlayTest.engine.simulationWorld.blockDamage.get(globalThis.d7ToolDamage.cell),
        starts: globalThis.d7Observed.starts,
      }));
      await test('Gated build strike keys show stored partial damage and remove terrain without a melee swing', () => {
        assert.equal(damaged.solid, true);
        assert.ok(damaged.damage > 0 && damaged.damage < damaged.durability);
        assert.equal(tool.remainingDamage, undefined);
        assert.deepEqual(tool.starts, []);
      });
    }

    phase('combat-click');
    await pressAction(page, 'debug.build-toggle');
    assert.equal(await page.evaluate(() => globalThis.skellyPlayTest.debugTools?.buildOn), false);
    await page.evaluate(() => {
      globalThis.d7Observed.starts = [];
      globalThis.d7Observed.combatStaminaBefore = globalThis.skellyPlayTest.session.sim.needs.stamina;
    });
    await page.mouse.down({ button: 'right' });
    await page.waitForFunction(() => globalThis.skellyPlayTest.input.controls.rightMouseActionHeld);
    await page.mouse.click(640, 360);
    await page.waitForFunction(() => globalThis.d7Observed.starts.length > 0);
    await page.mouse.up({ button: 'right' });
    const combat = await page.evaluate(() => ({
      starts: globalThis.d7Observed.starts,
      staminaBefore: globalThis.d7Observed.combatStaminaBefore,
      staminaAfter: globalThis.skellyPlayTest.session.sim.needs.stamina,
    }));
    await test('A native combat click with a melee weapon starts one attack and spends stamina (positive control)', () => {
      assert.equal(combat.starts.length, 1);
      const [start] = combat.starts;
      assert.ok(start);
      assert.equal(start.result, true);
      assert.equal(start.build, false);
      assert.equal(start.armed, true);
      assert.ok(combat.staminaBefore !== undefined, 'stamina was read before the click');
      assert.ok(combat.staminaAfter < combat.staminaBefore);
    });

    phase('combat-recovery');
    await page.waitForFunction(() => !globalThis.skellyPlayTest.session.playerCombat.activeMeleeAction, null, {
      timeout: 10_000,
    });
    phase('menu-click');
    await page.evaluate(() => {
      globalThis.d7Observed.starts = [];
    });
    await pressAction(page, 'ui.inventory-toggle');
    assert.equal(
      await page.evaluate(() => {
        const inventory = document.querySelector('#inventory');
        if (!(inventory instanceof HTMLElement)) {
          throw new Error('No #inventory panel is on the page');
        }
        return globalThis.skellyPlayTest.input.menuPointer && !inventory.hidden;
      }),
      true,
    );
    const menuInputFrame = await page.evaluate(() => globalThis.skellyPlayTest.session.sim.time);
    await page.mouse.click(640, 360);
    await pressAction(page, 'ui.inventory-toggle');
    await page.waitForFunction((before) => globalThis.skellyPlayTest.session.sim.time > before, menuInputFrame);
    const menu = await page.evaluate(() => ({
      locked: globalThis.skellyPlayTest.input.locked,
      menu: globalThis.skellyPlayTest.input.menuPointer,
      starts: globalThis.d7Observed.starts,
    }));
    await test('A canvas click consumed by the inventory cannot become an attack after Tab closes it', () => {
      assert.equal(menu.locked, true);
      assert.equal(menu.menu, false);
      assert.deepEqual(menu.starts, []);
    });
  };
  const checkWindow = async () => {
    phase('window-prompt');
    await page.evaluate(() => {
      const { session } = globalThis.skellyPlayTest;
      const intact = [...session.entities.all].find((entity) => entity.window?.pane === 'intact');
      if (!intact?.window?.latched) {
        throw new Error('Window fixture needs a reachable latched pane');
      }
      globalThis.windowReview = {
        readyAt: session.sim.time,
        initialZ: session.body.pos[2],
        standingHeight: session.body.height,
        yaw: globalThis.skellyPlayTest.input.controls.yaw,
        uid: intact.uid,
        floorBefore: [...session.inventory.piles.values()]
          .flatMap((pile) => pile.items)
          .filter(({ item }) => session.inventory.registry.items.get(item.type)?.groundHazard)
          .reduce((total, { item }) => total + item.count, 0),
      };
    });
    await page.waitForFunction(() => globalThis.skellyPlayTest.session.sim.time > globalThis.windowReview.readyAt);
    await page.waitForFunction(() => document.querySelector('#prompt .condition-mark'));
    phase('window-unlatch');
    await tapAction(page, 'world.interact');
    await page.waitForFunction(() => {
      const pane = globalThis.skellyPlayTest.session.entities.byUid(globalThis.windowReview.uid)?.window;
      return pane !== undefined && !pane.latched;
    });
    await tapAction(page, 'world.interact');
    await page.waitForFunction(
      () => globalThis.skellyPlayTest.session.entities.byUid(globalThis.windowReview.uid)?.window?.open === true,
    );
    for (const direction of ['forward', 'back']) {
      phase(`window-passage-${direction}`);
      await waitForSimulation(
        page,
        (way) => {
          const { session } = globalThis.skellyPlayTest;
          const entity = session.entities.byUid(globalThis.windowReview.uid);
          if (!entity) {
            throw new Error('The window fixture entity is gone');
          }
          return {
            time: session.sim.time,
            paused: session.sim.paused,
            reached:
              way === 'forward'
                ? session.body.pos[2] < entity.pos[2] - session.body.halfWidth
                : session.body.pos[2] >= globalThis.windowReview.initialZ,
            height: session.body.height,
            position: [...session.body.pos],
          };
        },
        direction,
        {
          seconds: 10,
          label: `standing window passage ${direction}`,
          record: (line) => process.stdout.write(`${line}\n`),
          hold: `movement.${direction}`,
        },
      );
    }
    assert.equal(
      await page.evaluate(() => globalThis.skellyPlayTest.session.body.height),
      await page.evaluate(() => globalThis.windowReview.standingHeight),
    );
    phase('window-close');
    const aimedAt = await page.evaluate(() => {
      const { session, input, engine } = globalThis.skellyPlayTest;
      const { camera } = engine;
      const entity = session.entities.byUid(globalThis.windowReview.uid);
      if (!entity) {
        throw new Error('The window fixture entity is gone');
      }
      const spec = session.entities.defOf(entity).window;
      if (!spec) {
        throw new Error('The window fixture entity has no window spec');
      }
      const { blockSize } = engine.config.scale;
      const x = (entity.pos[0] + spec.frameWidthBlocks / 2) * blockSize;
      const z = (entity.pos[2] + entity.size[2] / 2) * blockSize;
      input.controls.yaw = Math.atan2(camera.position.x - x, camera.position.z - z);
      return session.sim.time;
    });
    await page.waitForFunction((before) => globalThis.skellyPlayTest.session.sim.time > before, aimedAt);
    await tapAction(page, 'world.interact');
    await page.waitForFunction(
      () => globalThis.skellyPlayTest.session.entities.byUid(globalThis.windowReview.uid)?.window?.open === false,
    );
    phase('window-break');
    const paneAimedAt = await page.evaluate(() => {
      globalThis.skellyPlayTest.input.controls.yaw = globalThis.windowReview.yaw;
      return globalThis.skellyPlayTest.session.sim.time;
    });
    await page.waitForFunction((before) => globalThis.skellyPlayTest.session.sim.time > before, paneAimedAt);
    // Dispatch to the canvas so absolute pointer coordinates cannot move the pane out of aim.
    await page.evaluate(() => {
      const target = document.querySelector('#view');
      if (!target) {
        throw new Error('No #view canvas is on the page');
      }
      target.dispatchEvent(new MouseEvent('mousedown', { button: 2, buttons: 2, bubbles: true }));
    });
    await page.waitForFunction(() => globalThis.skellyPlayTest.input.controls.rightMouseActionHeld);
    await page.evaluate(() => {
      const target = document.querySelector('#view');
      if (!target) {
        throw new Error('No #view canvas is on the page');
      }
      target.dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 3, bubbles: true }));
      target.dispatchEvent(new MouseEvent('mouseup', { button: 0, buttons: 2, bubbles: true }));
    });
    await page.waitForFunction(() => Boolean(globalThis.skellyPlayTest.session.playerCombat.activeMeleeAction));
    await page.evaluate(() => {
      const target = document.querySelector('#view');
      if (!target) {
        throw new Error('No #view canvas is on the page');
      }
      target.dispatchEvent(new MouseEvent('mouseup', { button: 2, buttons: 0, bubbles: true }));
    });
    await page.waitForFunction(() => !globalThis.skellyPlayTest.session.playerCombat.activeMeleeAction);
    const windowBreak = await page.evaluate(() => {
      const { session } = globalThis.skellyPlayTest;
      const state = session.entities.byUid(globalThis.windowReview.uid)?.window;
      if (!state) {
        throw new Error('The window fixture entity is gone');
      }
      return {
        state,
        floorBefore: globalThis.windowReview.floorBefore,
        floorAfter: [...session.inventory.piles.values()]
          .flatMap((pile) => pile.items)
          .filter(({ item }) => session.inventory.registry.items.get(item.type)?.groundHazard)
          .reduce((total, { item }) => total + item.count, 0),
      };
    });
    await test('Window interaction events unlatch, open and close; melee breaks only the pane and drops floor glass', () => {
      assert.equal(windowBreak.state.pane, 'missing');
      assert.equal(windowBreak.state.open, false);
      assert.equal(windowBreak.state.frameRemnants, true);
      assert.ok(windowBreak.floorAfter > windowBreak.floorBefore);
    });
  };
  await (group === 'window' ? checkWindow() : checkNativeInputs());
  phase('teardown');
  await test('Native observation run produces no application errors', () => assert.deepEqual(errors, []));
} catch (error) {
  // A wait that times out between tests throws from the top level, which node:test reports as activity after the
  // tests ended and names no step. Report it as a failing test, with the wait's own stack.
  await test('The stage reaches its checks without a wait timing out', () => {
    throw error;
  });
} finally {
  await browser?.close();
  await vite.close();
}
