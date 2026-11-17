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
import { actionSnapshotExpression, pressAction } from './input-actions.mjs';
import { waitForSimulation } from './simulation-wait.mjs';
import { browserStageUrl } from './stage-mode.mjs';
import { createStageServer } from './stageServer.mjs';

const projectRoot = fileURLToPath(new URL('../..', import.meta.url));
// One browser task keeps the fixture's tap from turning into a hold during startup meshing.
const tapInteraction = async (page) => {
  const { primary } = await page.evaluate(actionSnapshotExpression('world.interact'));
  await page.evaluate(({ code }) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    document.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  }, primary);
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
  // Reuse the window fixture for every check: a second world load spends the input-stage budget on startup.
  await page.goto(
    browserStageUrl(
      'melee-build-click',
      gameUrl(`http://127.0.0.1:${address.port}`, {
        startMod: 'skelly.deadvox.scenario.test-house.window-look',
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
    globalThis.d7Observed = {
      starts: [],
      initialAim: { yaw: runtime.input.controls.yaw, pitch: runtime.input.controls.pitch },
    };
    const begin = runtime.session.playerCombat.beginMeleeSwing.bind(runtime.session.playerCombat);
    runtime.session.playerCombat.beginMeleeSwing = (start) => {
      const result = begin(start);
      globalThis.d7Observed.starts.push({
        result,
        build: runtime.debugTools.buildOn,
        armed: start.profile !== 'fists',
      });
      return result;
    };
  });

  await page.waitForFunction(() => globalThis.d7Review.input.locked && !globalThis.d7Review.input.menuPointer);
  const checkNativeInputs = async () => {
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
      assert.ok(
        build.staminaAfter >= build.staminaBefore,
        'editor input cannot spend stamina while recovery continues',
      );
    });

    // Skipped in CI until #1791: a wait in this block timed out once with no cause found; it still runs locally.
    if (process.env.GITHUB_ACTIONS !== 'true') {
      const downwardFrame = await page.evaluate(() => {
        // Break adjacent flooring, not our footing or the pane needed by the later window check.
        globalThis.d7Review.input.controls.yaw += Math.PI / 2;
        globalThis.d7Review.input.controls.pitch = -Math.PI / 3;
        return globalThis.d7Review.session.sim.time;
      });
      await page.waitForFunction((before) => globalThis.d7Review.session.sim.time > before, downwardFrame);
      await pressAction(page, 'debug.build-damage');
      await page.waitForFunction(
        () => globalThis.d7Review.engine.simulationWorld.blockDamage.snapshotState().entries.length > 0,
      );
      const damaged = await page.evaluate(async (numberTextModule) => {
        const { simulationWorld: world, registry } = globalThis.d7Review.engine;
        const [entry] = world.blockDamage.snapshotState().entries;
        const block = registry.blocks[world.getBlock(...entry.cell)];
        const material = registry.blockMaterials.get(block.material);
        const { decimalText } = await import(numberTextModule);
        globalThis.d7ToolDamage = { ...entry, text: decimalText(entry.damage) };
        return { damage: entry.damage, durability: material.durability, solid: block.solid };
      }, '/@stage/@skelly/engine/internal/core/numberText.ts');
      await page.waitForFunction(() =>
        document.querySelector('#hud').textContent.includes(globalThis.d7ToolDamage.text),
      );
      await pressAction(page, 'debug.build-destroy');
      await page.waitForFunction(
        () => globalThis.d7Review.engine.simulationWorld.getBlock(...globalThis.d7ToolDamage.cell) === 0,
      );
      const tool = await page.evaluate(() => ({
        remainingDamage: globalThis.d7Review.engine.simulationWorld.blockDamage.get(globalThis.d7ToolDamage.cell),
        starts: globalThis.d7Observed.starts,
      }));
      await test('Gated build strike keys show stored partial damage and remove terrain without a melee swing', () => {
        assert.equal(damaged.solid, true);
        assert.ok(damaged.damage > 0 && damaged.damage < damaged.durability);
        assert.equal(tool.remainingDamage, undefined);
        assert.deepEqual(tool.starts, []);
      });
    }

    await pressAction(page, 'debug.build-toggle');
    assert.equal(await page.evaluate(() => globalThis.d7Review.debugTools.buildOn), false);
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
      assert.equal(combat.starts[0].armed, true);
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
  };
  // The native combat control may strike the shared scene; prove its intact pane first.
  await page.evaluate(() => {
    const { session, input } = globalThis.d7Review;
    Object.assign(input.controls, globalThis.d7Observed.initialAim);
    const intact = [...session.entities.all].find((entity) => entity.window?.pane === 'intact');
    if (!intact?.window?.latched) {
      throw new Error('Window fixture needs a reachable latched pane');
    }
    globalThis.windowReview = {
      readyAt: session.sim.time,
      initialZ: session.body.pos[2],
      standingHeight: session.body.height,
      yaw: globalThis.d7Review.input.controls.yaw,
      uid: intact.uid,
      floorBefore: [...session.inventory.piles.values()]
        .flatMap((pile) => pile.items)
        .filter(({ item }) => session.inventory.registry.items.get(item.type)?.groundHazard)
        .reduce((total, { item }) => total + item.count, 0),
    };
  });
  await page.waitForFunction(() => globalThis.d7Review.session.sim.time > globalThis.windowReview.readyAt);
  await page.waitForFunction(() => document.querySelector('#prompt .condition-mark'));
  await tapInteraction(page);
  await page.waitForFunction(
    () => !globalThis.d7Review.session.entities.byUid(globalThis.windowReview.uid).window.latched,
  );
  await tapInteraction(page);
  await page.waitForFunction(() => globalThis.d7Review.session.entities.byUid(globalThis.windowReview.uid).window.open);
  for (const direction of ['forward', 'back']) {
    await waitForSimulation(
      page,
      (way) => {
        const { session } = globalThis.d7Review;
        const entity = session.entities.byUid(globalThis.windowReview.uid);
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
    await page.evaluate(() => globalThis.d7Review.session.body.height),
    await page.evaluate(() => globalThis.windowReview.standingHeight),
  );
  const aimedAt = await page.evaluate(() => {
    const { session, input, camera } = globalThis.d7Review;
    const entity = session.entities.byUid(globalThis.windowReview.uid);
    const spec = session.entities.defOf(entity).window;
    const { blockSize } = globalThis.d7Review.engine.config.scale;
    const x = (entity.pos[0] + spec.frameWidthBlocks / 2) * blockSize;
    const z = (entity.pos[2] + entity.size[2] / 2) * blockSize;
    input.controls.yaw = Math.atan2(camera.position.x - x, camera.position.z - z);
    return session.sim.time;
  });
  await page.waitForFunction((before) => globalThis.d7Review.session.sim.time > before, aimedAt);
  await tapInteraction(page);
  await page.waitForFunction(
    () => !globalThis.d7Review.session.entities.byUid(globalThis.windowReview.uid).window.open,
  );
  const paneAimedAt = await page.evaluate(() => {
    globalThis.d7Review.input.controls.yaw = globalThis.windowReview.yaw;
    return globalThis.d7Review.session.sim.time;
  });
  await page.waitForFunction((before) => globalThis.d7Review.session.sim.time > before, paneAimedAt);
  // Dispatch to the canvas so absolute pointer coordinates cannot move the pane out of aim.
  await page.evaluate(() =>
    document
      .querySelector('#view')
      .dispatchEvent(new MouseEvent('mousedown', { button: 2, buttons: 2, bubbles: true })),
  );
  await page.waitForFunction(() => globalThis.d7Review.input.controls.rightMouseActionHeld);
  await page.evaluate(() => {
    const target = document.querySelector('#view');
    target.dispatchEvent(new MouseEvent('mousedown', { button: 0, buttons: 3, bubbles: true }));
    target.dispatchEvent(new MouseEvent('mouseup', { button: 0, buttons: 2, bubbles: true }));
  });
  await page.waitForFunction(() => Boolean(globalThis.d7Review.session.playerCombat.activeMeleeAction));
  await page.evaluate(() =>
    document.querySelector('#view').dispatchEvent(new MouseEvent('mouseup', { button: 2, buttons: 0, bubbles: true })),
  );
  await page.waitForFunction(() => !globalThis.d7Review.session.playerCombat.activeMeleeAction);
  const windowBreak = await page.evaluate(() => {
    const { session } = globalThis.d7Review;
    return {
      state: session.entities.byUid(globalThis.windowReview.uid).window,
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
  await checkNativeInputs();
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
