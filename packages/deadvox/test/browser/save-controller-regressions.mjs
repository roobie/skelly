// biome-ignore-all lint/correctness/noNodejsModules: standalone browser regression contract
// biome-ignore-all lint/performance/noAwaitInLoops: frame thresholds are deliberately exercised in order
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone Node test contract
// biome-ignore-all lint/style/noProcessEnv: browser executable and runtime are configured by the test runner
// biome-ignore-all lint/correctness/noUndeclaredVariables: page.evaluate callbacks run in the browser context
// biome-ignore-all lint/correctness/noUnresolvedImports: page imports resolve through the fixture's Vite server

import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readHash, writeHash } from '../../src/hashState.ts';
import { launchChromium } from './chromium.mjs';
import { holdAction, pressAction } from './input-actions.mjs';
import { auditModelLoads } from './model-load-audit.mjs';
import { saveControllerServer } from './save-controller-fixture.mjs';
import { browserStageUrl } from './stage-mode.mjs';
import { installWorldMeshControl } from './world-mesh-fixture.mjs';

const root = resolvePath(fileURLToPath(new URL('../..', import.meta.url)));
const { decodeSave } = await import('@skelly/engine/save');
const { metricsStorageKey } = await import(pathToFileURL(`${root}/../presentation/src/presentation/playtestTools.ts`));
const { server, address } = await saveControllerServer();
const browser = await launchChromium('save-controller-regressions', { headless: true });
const url = browserStageUrl('save-controller-regressions', address);
const QUOTA_ERROR = /quota regression/i;
const BEST_EFFORT = /best.effort/i;
const PERSISTENCE_GRANTED = /Persistent storage granted/;
const CURRENT_EXPORT = /^skelly-current-.*\.bin$/;
const REPLAY_REJECTED = /^Replay rejected:/;
const LOADING_WORKER_FAILURE = /Controlled loading worker failure/;
const REFUSED_SAVE_FIXTURE = /refused save fixture/i;

try {
  await test('practice launch, lifecycle and death leave the normal save untouched and exit returns to start', async () => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    const modelAudit = await auditModelLoads(context);
    try {
      const page = await context.newPage();
      await page.goto(url);
      await page.waitForFunction(() => globalThis.skellySaveTest?.controller.ready);
      await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
      await page.click('#go');
      await page.waitForFunction(() => globalThis.saveControllerPlayStarted === true);
      await page.waitForFunction(() => !(skellySaveTest.controller.writing || skellySaveTest.controller.queued));
      const saved = await page.evaluate(async () => {
        const { controller, storage, namespace } = skellySaveTest;
        controller.halt();
        await storage.save(namespace, (generation) =>
          storage.encodeSnapshot(controller.snapshot(), generation, {
            worldOptions: controller.worldOptions,
            version: controller.identityValue.components,
            buildRevision: controller.identityValue.buildRevision,
          }),
        );
        const record = await storage.load(namespace);
        return { namespace, generation: record.generation, payload: Array.from(record.payload) };
      });
      await page.reload();
      await page.waitForFunction(() => globalThis.skellySaveTest?.controller.ready);
      await page.click('#tutorial-start');
      await page.waitForFunction(() => globalThis.tutorialSession !== undefined);
      assert.equal(
        await page.evaluate(() => globalThis.gauntletWitness.engine.site.practiceExitMark),
        'fixture_guide_exit',
        'the live guide uses the independently named content mark',
      );
      assert.equal(
        await page.evaluate(() => Boolean(globalThis.saveControllerConstructed)),
        false,
        'practice never creates a persistence owner',
      );
      await page.locator('#go').waitFor({ state: 'visible' });
      assert.equal(
        await page.locator('[data-tutorial-stage]').getAttribute('data-tutorial-stage'),
        'fixture_arrival',
        'the live guide renders its authored stage identity rather than a built-in stage',
      );
      const binding = await page.evaluate(async () => {
        const { inputBindings } = await import('/src/product/input.ts');
        const id = 'movement.forward';
        const original = inputBindings.chords(id);
        const cap = document.querySelector(`[data-tutorial-action="${id}"] kbd`);
        if (!cap || cap.textContent !== inputBindings.label(id)) {
          throw new Error('Practice hint must show the live binding');
        }
        const previous = cap.textContent;
        const replacement = ['KeyY', 'KeyU', 'KeyI', 'KeyO'].find(
          (code) => inputBindings.rebind(id, [{ code }]) === undefined && inputBindings.label(id) !== previous,
        );
        if (!replacement) {
          throw new Error('Fixture needs an available alternate binding');
        }
        return { id, original, previous };
      });
      await page.waitForFunction(async ({ id, previous }) => {
        const { inputBindings } = await import('/src/product/input.ts');
        const cap = document.querySelector(`[data-tutorial-action="${id}"] kbd`);
        return cap?.textContent === inputBindings.label(id) && cap.textContent !== previous;
      }, binding);
      await page.getByRole('button', { name: 'Practice controls', exact: true }).press('Enter');
      assert.equal(
        await page.evaluate(async () => {
          const { controlsCardRows, filterControlsCardRows } = await import(
            '/@stage/@skelly/presentation/internal/presentation/controls.ts'
          );
          const { inputBindings } = await import('/src/product/input.ts');
          const { topics } = gauntletWitness.engine.site.guidance.steps[0];
          const search = document.querySelector('#controls-search');
          const expected = filterControlsCardRows(controlsCardRows(inputBindings), topics).map(({ id }) => id);
          const actual = [...document.querySelectorAll('#controls [data-input-action]')].map(
            (row) => row.dataset.inputAction,
          );
          return (
            search === document.activeElement &&
            expected.length > 0 &&
            expected.length < controlsCardRows(inputBindings).length &&
            JSON.stringify(actual) === JSON.stringify(expected) &&
            expected.includes('movement.forward')
          );
        }),
        true,
        'practice opens the shared controls card on the movement topic',
      );
      await page.evaluate(async ({ id, original }) => {
        const { inputBindings } = await import('/src/product/input.ts');
        if (inputBindings.rebind(id, original) !== undefined) {
          throw new Error('Binding restoration failed');
        }
      }, binding);
      const canHints = await page.evaluate(async () => {
        const { GuidedSteps: Tutorial } = await import(
          '/@stage/@skelly/presentation/internal/presentation/guidedSteps.ts'
        );
        const { mountGuidance: mountTutorial } = await import(
          '/@stage/@skelly/presentation/internal/ui/guidedSteps.ts'
        );
        const { Inventory } = await import('/@stage/@skelly/engine/internal/core/inventory.ts');
        const { HandlingQueue } = await import('/@stage/@skelly/engine/internal/core/handling.ts');
        const { Unpacking } = await import('/@stage/@skelly/engine/internal/game/unpacking.ts');
        const { dominantSide } = await import('/@stage/@skelly/engine/internal/core/character.ts');
        const { inputBindings } = await import('/src/product/input.ts');
        // Own fixture inventory: no injected progress or inventory changes in the playing session.
        const inventory = new Inventory(gauntletWitness.engine.registry);
        const bag = inventory.create('hiking_backpack');
        const can = inventory.create('canned_beans');
        const opener = inventory.create('can_opener');
        const side = dominantSide(inventory.character);
        if (
          !(
            inventory.add(bag, { kind: 'worn' }) &&
            inventory.add(opener, { kind: 'hand', side: side === 'right' ? 'left' : 'right' }) &&
            inventory.add(can, { kind: 'hand', side })
          )
        ) {
          throw new Error('Can fixture must fit');
        }
        const definition = gauntletWitness.engine.site.guidance;
        const lootTutorial = new Tutorial([0, 0, 0], 0, { x0: 20, x1: 21, z0: 20, z1: 21 }, definition);
        lootTutorial.observe({
          position: [8, 0, 0],
          yaw: 1,
          crouching: false,
          doorOpen: true,
          searched: false,
          looted: false,
          wielded: false,
          lightOn: false,
          paused: false,
        });
        const tutorial = new Tutorial([0, 0, 0], 0, { x0: 20, x1: 21, z0: 20, z1: 21 }, definition);
        tutorial.observe({
          position: [8, 0, 0],
          yaw: 1,
          crouching: false,
          doorOpen: true,
          searched: true,
          looted: true,
          wielded: true,
          lightOn: false,
          paused: false,
        });
        const queue = new HandlingQueue(inventory);
        const unpacking = new Unpacking(inventory, queue, () => [0, 0, 0], {
          opened: (type) => tutorial.opened(type),
        });
        gauntletWitness.manual = true;
        try {
          const draw = mountTutorial(
            tutorial,
            () => undefined,
            () => undefined,
            inputBindings,
          );
          const actions = () =>
            [...document.querySelectorAll('#tutorial-objective [data-tutorial-action]')].map(
              (node) => node.dataset.tutorialAction,
            );
          mountTutorial(
            lootTutorial,
            () => undefined,
            () => undefined,
            inputBindings,
          )({
            inventory,
            inventoryOpen: true,
            lightOn: false,
          });
          const loot = actions();
          const lootCaps = Object.fromEntries(
            [...document.querySelectorAll('#tutorial-objective [data-tutorial-action]')].map((node) => [
              node.dataset.tutorialAction,
              node.querySelector('kbd')?.textContent,
            ]),
          );
          draw({ inventory, inventoryOpen: false, lightOn: false });
          const sealed = actions();
          if (unpacking.activate(can) !== undefined || queue.tick(queue.remaining).failed.length > 0) {
            throw new Error('Ordinary can activation must complete');
          }
          draw({ inventory, inventoryOpen: true, lightOn: false });
          const opened = actions();
          if (inventory.hands[side] !== can || !inventory.registry.items.get(can.type)?.serving) {
            throw new Error('Opening must retain the food vessel in hand');
          }
          draw({ inventory, inventoryOpen: false, lightOn: false });
          return {
            loot,
            lootCaps,
            labels: Object.fromEntries(loot.map((id) => [id, inputBindings.label(id)])),
            sealed,
            opened,
            eating: actions(),
            awaitingConsumption: tutorial.step.complete.all.some((id) =>
              tutorial.definition.rules.some((rule) => rule.id === id && rule.when.kind === 'consumed'),
            ),
          };
        } finally {
          gauntletWitness.manual = false;
        }
      });
      assert(canHints.loot.length > 0, 'open inventory offers loot actions');
      assert(
        canHints.loot.every((id) => canHints.lootCaps[id] === canHints.labels[id]),
        'open inventory loot actions use their live registry labels',
      );
      assert(canHints.sealed.includes('hand.use-off'), 'the held opener points to its hand activation');
      assert(canHints.opened.includes('inventory.activate'), 'open inventory offers held-item activation');
      assert(canHints.eating.includes('hand.use-dominant'), 'held food points back to hand activation');
      assert.equal(canHints.awaitingConsumption, true, 'opening and wielding alone are not consumption');
      const weaponsHints = await page.evaluate(async () => {
        const { GuidedSteps: Tutorial } = await import(
          '/@stage/@skelly/presentation/internal/presentation/guidedSteps.ts'
        );
        const { mountGuidance: mountTutorial } = await import(
          '/@stage/@skelly/presentation/internal/ui/guidedSteps.ts'
        );
        const { Inventory } = await import('/@stage/@skelly/engine/internal/core/inventory.ts');
        const { HandlingQueue } = await import('/@stage/@skelly/engine/internal/core/handling.ts');
        const { FirearmMechanics } = await import('/@stage/@skelly/engine/internal/game/firearmHandling.ts');
        const { InventoryScreen } = await import('/@stage/@skelly/presentation/internal/ui/inventoryScreen.ts');
        const { bindReach } = await import('/@stage/@skelly/engine/internal/core/reach.ts');
        const { fixtureIds } = await import('/test/fixtures/capabilityIds.ts');
        const { Unpacking } = await import('/@stage/@skelly/engine/internal/game/unpacking.ts');
        const { inputBindings } = await import('/src/product/input.ts');
        const inventory = new Inventory(gauntletWitness.engine.registry);
        const queue = new HandlingQueue(inventory);
        let finished = false;
        const definition = inventory.registry.layouts.get('tutorial').guidance;
        const tutorial = new Tutorial([0, 0, 0], 0, { x0: 7, x1: 9, z0: 0, z1: 2 }, definition);
        tutorial.opened('canned_beans');
        tutorial.consumed('beans');
        tutorial.consumed('water_bottle');
        const state = {
          position: [8, 0, 1],
          yaw: 1,
          crouching: true,
          doorOpen: true,
          searched: true,
          looted: true,
          wielded: true,
          lightOn: true,
          litType: undefined,
          paused: false,
        };
        tutorial.observe(state);
        tutorial.observe({ ...state, lightOn: false, paused: true });
        const presentation = { inventory, inventoryOpen: true, lightOn: false };
        const id = 'firearm.reload';
        const original = inputBindings.chords(id);
        gauntletWitness.manual = true;
        try {
          const draw = mountTutorial(
            tutorial,
            () => {
              finished = true;
            },
            () => undefined,
            inputBindings,
          );
          draw(presentation);
          const exitChoice = definition.choices.find(
            (choice) => choice.action === 'exit' && tutorial.canChoose(choice.id),
          );
          const offered =
            !finished && Boolean(exitChoice && document.querySelector(`[data-tutorial-choice="${exitChoice.id}"]`));
          const handlingChoice = definition.choices.find(
            (choice) =>
              choice.action === 'choose' &&
              tutorial.canChoose(choice.id) &&
              definition.steps.some((step) => step.enabled.none.includes(choice.id)),
          );
          document.querySelector(`[data-tutorial-choice="${handlingChoice.id}"]`).click();
          const branched = tutorial.step.complete.handling !== undefined && !finished;
          const bag = inventory.create('hiking_backpack');
          const box = inventory.create('cartridge_box_357_h_magnum');
          if (!(inventory.add(bag, { kind: 'worn' }) && inventory.add(box, { kind: 'hand', side: 'right' }))) {
            throw new Error('Weapons fixture must fit');
          }
          const unpack = new Unpacking(inventory, queue, () => [0, 1, 0], {
            unpacked: (type) => tutorial.weapons.unpackedAmmo(type),
          });
          if (unpack.activate(box) !== undefined || queue.tick(queue.remaining).failed.length > 0) {
            throw new Error('Ammunition unpack must complete');
          }
          const gun = inventory.create('revolver_357');
          if (!inventory.add(gun, { kind: 'hand', side: 'right' })) {
            throw new Error('Gun must fit');
          }
          tutorial.weapons.wielded(gun, inventory.registry);
          draw(presentation);
          const inspect = Boolean(document.querySelector('[data-tutorial-action="ui.inventory-toggle"]'));
          const firearms = new FirearmMechanics(inventory, queue, {
            blockSize: 0.5,
            pose: () => undefined,
            onEjection: () => undefined,
          });
          const openedDetails = (() => {
            const details = firearms.describe(gun);
            const inventoryRoot = document.createElement('div');
            document.body.append(inventoryRoot);
            const screen = new InventoryScreen(inventoryRoot, inventory, queue, {
              bindings: inputBindings,
              feet: () => [0, 1, 0],
              reach: bindReach({
                inventory,
                position: [0, 1, 0],
                blockSize: 0.5,
                clock: gauntletWitness.session.reach().player.clock,
              }),
              nearby: () => [],
              containers: () => [],
              distance: () => 0,
              entityDistance: () => 0,
              dispatch: () => undefined,
              searching: () => false,
              notice: () => undefined,
              describe: (item) => {
                tutorial.weapons.inspected(item, inventory.registry);
                return firearms.describe(item);
              },
              workOptions: () => [],
              character: () => gauntletWitness.session.character,
              body: () => gauntletWitness.session.sim.body,
              needs: () => '',
              slotLabels: inventory.registry.ui.get(fixtureIds.ui).wearSlotLabels,
            });
            let presented = false;
            try {
              screen.open();
              inventoryRoot
                .querySelector(`[data-uid="${gun.uid}"]`)
                .dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
              globalThis.dispatchEvent(new PointerEvent('pointerup', { button: 0, pointerType: 'mouse' }));
              const pane = inventoryRoot.querySelector('[data-pane="details"]');
              presented =
                pane.dataset.selectedUid === String(gun.uid) &&
                details.length > 0 &&
                details.every((line) => pane.textContent.includes(line));
            } finally {
              screen.close();
              inventoryRoot.remove();
            }
            return presented;
          })();
          presentation.inventoryOpen = false;
          draw(presentation);
          const before = document.querySelector(`[data-tutorial-action="${id}"] kbd`)?.textContent;
          const replacement = ['KeyY', 'KeyU', 'KeyO'].find(
            (code) => inputBindings.rebind(id, [{ code }]) === undefined && inputBindings.label(id) !== before,
          );
          if (!replacement) {
            throw new Error('Reload fixture needs an alternate binding');
          }
          draw(presentation);
          const rebound = document.querySelector(`[data-tutorial-action="${id}"] kbd`)?.textContent;
          return {
            offered,
            branched,
            inspect,
            details: openedDetails,
            rebound: rebound === inputBindings.label(id) && rebound !== before,
          };
        } finally {
          inputBindings.rebind(id, original);
          gauntletWitness.manual = false;
        }
      });
      assert(
        Object.values(weaponsHints).every(Boolean),
        'optional weapons branch retains completion, ammunition details and live reload keycaps',
      );
      await page.click('#go');
      await page.waitForFunction(() => globalThis.tutorialSession.sim.paused === false);
      await page.evaluate(async () => {
        const { GuidedSteps: Tutorial } = await import(
          '/@stage/@skelly/presentation/internal/presentation/guidedSteps.ts'
        );
        const { mountGuidance: mountTutorial } = await import(
          '/@stage/@skelly/presentation/internal/ui/guidedSteps.ts'
        );
        const { engine, session } = gauntletWitness;
        // A separate observer starts at this lesson; the playing session still owns movement and stance.
        const { stageMarkArea } = await import('/@stage/@skelly/engine/internal/core/stageMarks.ts');
        const exit = stageMarkArea(engine.site.playtestMarks.beats, engine.site.practiceExitMark);
        const tutorial = new Tutorial([0, 0, 0], 0, exit, engine.site.guidance);
        tutorial.opened('canned_beans');
        tutorial.consumed('beans');
        tutorial.consumed('water_bottle');
        const prerequisites = {
          position: [8, 0, 0],
          yaw: 1,
          crouching: false,
          doorOpen: true,
          searched: true,
          looted: true,
          wielded: true,
          lightOn: true,
          paused: false,
        };
        tutorial.observe(prerequisites);
        tutorial.observe({ ...prerequisites, lightOn: false });
        const { inputBindings } = await import('/src/product/input.ts');
        const draw = mountTutorial(
          tutorial,
          () => undefined,
          () => undefined,
          inputBindings,
        );
        const observe = () => {
          tutorial.observe({
            ...prerequisites,
            position: session.body.pos,
            crouching: session.stance === 'crouching',
            lightOn: false,
          });
          draw({ inventory: session.inventory, inventoryOpen: false, lightOn: false });
          return tutorial.stage;
        };
        gauntletWitness.manual = true;
        const { definition } = tutorial;
        const stageFor = (kind) =>
          definition.steps.find((step) =>
            step.complete.all.some((id) => definition.rules.some((rule) => rule.id === id && rule.when.kind === kind)),
          ).id;
        const exitStage = stageFor('area');
        const pauseStage = stageFor('pause');
        globalThis.tutorialExitFixture = { tutorial, exit, observe, exitStage, pauseStage };
        if (observe() !== exitStage) {
          throw new Error('Exit fixture must begin with an unfinished escape lesson');
        }
      });
      const releaseForward = await holdAction(page, 'movement.forward');
      try {
        await page.evaluate(() => {
          const { session, input, engine } = gauntletWitness;
          const { exit, observe } = tutorialExitFixture;
          const x = (exit.x0 + exit.x1) / 2;
          const z = (exit.z0 + exit.z1) / 2;
          for (const target of [
            [x, session.body.pos[2]],
            [x, z],
          ]) {
            let reached = false;
            for (let tick = 0; tick < 3600; tick++) {
              const dx = target[0] - session.body.pos[0];
              const dz = target[1] - session.body.pos[2];
              if (Math.hypot(dx, dz) < 0.5) {
                reached = true;
                break;
              }
              input.controls.yaw = Math.atan2(-dx, -dz);
              engine.streamer.update(session.body.pos[0], session.body.pos[2]);
              session.frame(1 / 60);
              observe();
            }
            if (!reached) {
              throw new Error('Ordinary forward input must reach the exit via the west side of the station');
            }
          }
        });
      } finally {
        await releaseForward();
      }
      assert.equal(
        await page.evaluate(() => tutorialExitFixture.observe() === tutorialExitFixture.exitStage),
        true,
        'reaching the named destination without crouching is not enough',
      );
      await pressAction(page, 'player.crouch-toggle');
      assert.equal(
        await page.evaluate(() => {
          gauntletWitness.session.frame(1 / 60);
          const stage = tutorialExitFixture.observe();
          gauntletWitness.manual = false;
          return stage === tutorialExitFixture.pauseStage;
        }),
        true,
        'ordinary crouch input at the named destination completes the exit lesson',
      );
      await page.evaluate(() => {
        document.dispatchEvent(new Event('visibilitychange'));
        globalThis.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
        tutorialSession.sim.body.damageHealth(tutorialSession.sim.body.health);
      });
      await page.waitForFunction(() => !document.querySelector('#death').hidden);
      const after = await page.evaluate(async (namespace) => {
        const { SaveStorage } = await import('/@stage/@skelly/presentation/internal/presentation/saveStorage.ts');
        const storage = new SaveStorage({ backend: 'indexeddb' });
        try {
          const record = await storage.load(namespace);
          return { namespace, generation: record.generation, payload: Array.from(record.payload) };
        } finally {
          storage.close();
        }
      }, saved.namespace);
      assert.deepEqual(after, saved, 'no checkpoint or death marker replaces the normal generation');
      assert.equal(
        await page.evaluate((namespace) => sessionStorage.getItem(`skelly.dead-world:${namespace}`), saved.namespace),
        null,
      );
      // Native pointer activation of the practice exits is quarantined in #705; its root cause is unresolved.
      const practiceHref = page.url();
      await Promise.all([
        page.waitForURL((target) => target.href !== practiceHref),
        page.locator('#death button').press('Enter'),
      ]);
      await page.waitForFunction(
        () => document.querySelector('#tutorial-start') && document.querySelector('#startup-screen').hidden,
      );
      assert.equal(await page.locator('#tutorial-start').isVisible(), true);
      assert.equal(await page.locator('#continue').isEnabled(), true);
      assert.equal(await page.locator('#title-prompt').isHidden(), true, 'saved-world choice hides the centre prompt');
      await page.click('#tutorial-start');
      await page.waitForFunction(() => globalThis.tutorialSession !== undefined);
      const reenteredHref = page.url();
      await Promise.all([
        page.waitForURL((target) => target.href !== reenteredHref),
        page.getByRole('button', { name: 'Exit practice', exact: true }).press('Enter'),
      ]);
      await page.waitForFunction(() => document.querySelector('#startup-screen').hidden);
      assert.equal(await page.locator('#continue').isEnabled(), true);
    } finally {
      await modelAudit.close();
    }
  });

  await test('rejected pending replay reveals its error instead of leaving the loading screen up', async () => {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    try {
      await context.addInitScript(() => {
        sessionStorage.setItem('skelly.pending-replay', btoa('not a replay'));
      });
      const page = await context.newPage();
      await page.goto(url);
      await page.waitForFunction(() => document.querySelector('#errors')?.textContent.startsWith('Replay rejected:'));
      assert.equal(await page.locator('#startup-screen').isVisible(), false);
      assert.equal(await page.locator('#errors').isVisible(), true);
      assert.match(await page.locator('#errors').textContent(), REPLAY_REJECTED);
    } finally {
      await context.close();
    }
  });

  await test('persistence button alone requests once and updates status after an unavailable startup query', async () => {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    try {
      await context.addInitScript(() => {
        globalThis.persistenceRequests = 0;
        Object.defineProperties(navigator.storage, {
          persisted: { configurable: true, value: () => Promise.reject(new Error('query unavailable')) },
          persist: {
            configurable: true,
            value: () => {
              globalThis.persistenceRequests += 1;
              return Promise.resolve(true);
            },
          },
        });
      });
      const page = await context.newPage();
      await page.goto(url);
      await page.waitForFunction(() => globalThis.skellySaveTest?.controller.ready, undefined, { timeout: 30_000 });
      const button = page.locator('#save-persist');
      assert.equal(await button.isVisible(), true, 'request remains reachable when state is unknown and API exists');
      assert.match(await page.locator('#save-status').textContent(), BEST_EFFORT);
      assert.equal(await page.evaluate(() => globalThis.persistenceRequests), 0);
      await button.focus();
      const detail = button.locator('[role="tooltip"]');
      assert.equal(await detail.isVisible(), true, 'focus exposes the persistence rule on its action');
      await button.click();
      await page.waitForFunction(() =>
        document.querySelector('#save-status').textContent.includes('Persistent storage granted'),
      );
      assert.equal(
        await page.evaluate(() => globalThis.persistenceRequests),
        1,
        'one player click makes one native API call',
      );
      assert.equal(await button.isVisible(), false, 'granted status removes the request button');
      assert.equal(await detail.isVisible(), false, 'the persistence rule leaves with its action');
      assert.equal(
        await button.evaluate((action) => {
          action.blur();
          action.focus();
          return document.activeElement === action;
        }),
        false,
        'the hidden persistence action cannot retain keyboard focus',
      );
      assert.equal(await page.evaluate(() => globalThis.skellySaveTest.controller.storageStatus.persistent), true);
      assert.equal(
        await page.evaluate(async () => (await globalThis.skellySaveTest.storage.status()).persistent),
        true,
      );
    } finally {
      await context.close();
    }
  });

  await test('startup covers persistence action until save discovery finishes', async () => {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    try {
      await context.addInitScript(() => {
        globalThis.persistenceRequests = 0;
        globalThis.persistenceQueries = 0;
        Object.defineProperties(navigator.storage, {
          persisted: {
            configurable: true,
            value: () => {
              globalThis.persistenceQueries += 1;
              return Promise.reject(new Error('query unavailable'));
            },
          },
          persist: {
            configurable: true,
            value: () => {
              globalThis.persistenceRequests += 1;
              return Promise.resolve(true);
            },
          },
        });
        const digest = crypto.subtle.digest.bind(crypto.subtle);
        let holdFirstDigest = true;
        crypto.subtle.digest = (...args) => {
          if (!holdFirstDigest) {
            return digest(...args);
          }
          holdFirstDigest = false;
          return new Promise((resolve, reject) => {
            globalThis.releasePersistenceIdentity = () => digest(...args).then(resolve, reject);
          });
        };
      });
      const page = await context.newPage();
      await page.goto(url);
      await page.waitForFunction(() => typeof globalThis.releasePersistenceIdentity === 'function');
      await page.waitForFunction(() => {
        const status = document.querySelector('#startup-screen #save-status');
        return Boolean(
          status?.textContent.trim() &&
            globalThis.skellySaveTest?.controller &&
            !globalThis.skellySaveTest.controller.ready,
        );
      });
      assert.equal(await page.locator('#startup-screen').isVisible(), true, 'startup remains visible during discovery');
      assert.equal(
        await page.locator('#startup-screen #save-status').isVisible(),
        true,
        'discovery status is visible under the bar',
      );
      const button = page.locator('#save-persist');
      assert.equal(await button.isVisible(), true, 'the controller still renders its action while state is unknown');
      assert.equal(await button.isEnabled(), true);
      assert.equal(
        await page.evaluate(() => {
          const action = document.querySelector('#save-persist');
          const rect = action.getBoundingClientRect();
          return (
            document
              .elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
              ?.closest('#startup-screen') !== null
          );
        }),
        true,
        'startup screen covers the action until discovery finishes',
      );
      assert.equal(
        await button.evaluate((action) => {
          action.focus();
          return document.activeElement === action;
        }),
        false,
        'keyboard focus cannot reach the action during discovery',
      );
      assert.equal(await page.evaluate(() => globalThis.persistenceQueries), 0, 'advisory status has not started');
      assert.equal(await page.evaluate(() => globalThis.persistenceRequests), 0);
      await page.evaluate(() => globalThis.releasePersistenceIdentity());
      await page.waitForFunction(
        () => globalThis.skellySaveTest?.controller.ready && document.querySelector('#startup-screen').hidden,
        undefined,
        { timeout: 30_000 },
      );
      assert.equal(await button.isVisible(), true, 'action is available after discovery finishes');
      assert.equal(await page.locator('#save-status').isVisible(), true, 'final discovery status is on the title card');
      assert.equal(await page.evaluate(() => globalThis.persistenceQueries), 1);
      await button.click();
      await page.waitForFunction(() =>
        document.querySelector('#save-status').textContent.includes('Persistent storage granted'),
      );
      assert.equal(await page.evaluate(() => globalThis.persistenceRequests), 1);
      assert.match(await page.locator('#save-status').textContent(), PERSISTENCE_GRANTED);
      assert.equal(await button.isVisible(), false, 'explicit grant removes the request action');
      assert.equal(await page.evaluate(() => globalThis.skellySaveTest.controller.storageStatus.persistent), true);
      assert.equal(
        await page.evaluate(async () => (await globalThis.skellySaveTest.storage.status()).persistent),
        true,
      );
    } finally {
      await context.close();
    }
  });

  // biome-ignore lint/style/noDoneCallback: Node's TestContext registers cleanup, not a done callback.
  await test('title, loading mask, periodic checkpoint, and visible save-failure recovery', async (t) => {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    t.after(() => context.close());
    await context.addInitScript(installWorldMeshControl);
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => globalThis.skellySaveTest?.controller.ready, undefined, { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    const pageAddress = new URL(page.url());
    const radiusLinks = (
      await page
        .locator('[data-view-distance]')
        .evaluateAll((links) => links.map((link) => ({ radius: link.dataset.viewDistance, href: link.href })))
    ).map(({ radius, href }) => {
      const expected = new URL(pageAddress);
      expected.hash = writeHash({ ...readHash(pageAddress.hash).hash, radius: Number(radius) });
      return href === expected.href;
    });
    assert(radiusLinks.length > 0, 'view-distance links are present');
    assert(radiusLinks.every(Boolean), 'each view-distance link preserves the current URL parameters');
    await page.click('#show-credits');
    assert.equal(await page.locator('#about').isVisible(), false, 'the About card is replaced by credits');
    assert.equal(await page.locator('#credits').isVisible(), true, 'credits open from the title screen');
    await page.locator('#credits a[href="#"]').click();
    assert.equal(await page.locator('#about').isVisible(), true, 'Back returns to the About card');
    assert.equal(await page.locator('#credits').isVisible(), false);
    assert.equal(
      await page.locator('#startup-screen').isVisible(),
      false,
      'loading ends when the title screen is ready',
    );
    assert.equal(
      await page.locator('#overlay').evaluate((overlay) => overlay.classList.contains('startup-ready')),
      true,
    );
    assert.equal(
      await page
        .locator('#go')
        .evaluate(
          (go) =>
            [...go.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()).length,
        ),
      1,
      'the start hint has one text node',
    );
    const card = page.locator('#overlay .card');
    await page.setViewportSize({ width: 800, height: 200 });
    await page.waitForFunction(() => document.querySelector('#card-scroll-down')?.hidden === false);
    await card.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event('scroll'));
    });
    await page.waitForFunction(
      () =>
        document.querySelector('#card-scroll-up')?.hidden === false &&
        document.querySelector('#card-scroll-down')?.hidden === true,
    );
    await card.evaluate((element) => {
      element.scrollTop = 0;
      element.dispatchEvent(new Event('scroll'));
    });
    await page.setViewportSize({ width: 800, height: 600 });
    const before = await page.evaluate(() => ({
      hasSnapshot: typeof skellySaveTest.controller.snapshot === 'function',
      entered: skellySaveTest.controller.isEntered,
    }));
    assert.deepEqual(before, { hasSnapshot: false, entered: false });
    await pressAction(page, 'ui.inventory-toggle');
    await pressAction(page, 'movement.forward');
    await page.keyboard.press('F10');
    const after = await page.evaluate(() => ({
      hasSnapshot: typeof skellySaveTest.controller.snapshot === 'function',
      entered: skellySaveTest.controller.isEntered,
      overlayHidden: document.querySelector('#overlay').hidden,
    }));
    assert.equal(after.entered, false);
    assert.equal(after.hasSnapshot, false, 'title keys cannot construct a session');
    assert.equal(after.overlayHidden, false);

    await page.evaluate(() => {
      globalThis.holdWorldMeshes = true;
    });
    await page.click('#go');
    await page.waitForFunction(() => globalThis.saveControllerPlayStarted === true);
    assert.equal(
      await page.locator('#world-loading').isVisible(),
      true,
      'start click covers the view before meshes complete',
    );
    await page.waitForFunction(() => document.pointerLockElement !== null && document.querySelector('#overlay').hidden);
    const masked = await page.evaluate(() => {
      const { session, worldLoading, frame, engine } = globalThis.worldLoadWitness;
      const { time } = session.sim;
      const position = [...session.body.pos];
      const now = performance.now();
      for (let step = 1; step <= 3; step++) {
        frame(now + step * 100);
      }
      return {
        ready: worldLoading.ready,
        paused: session.sim.paused,
        timeUnchanged: session.sim.time === time,
        positionUnchanged: session.body.pos.every((value, axis) => value === position[axis]),
        pending: engine.streamer.unmeshedColumns(session.body.pos[0], session.body.pos[2], engine.config.radiusChunks),
      };
    });
    assert.equal(masked.ready, false);
    assert(masked.pending > 0, 'the controlled mesh owner has actual unfinished work');
    assert.equal(masked.paused, true);
    assert.equal(masked.timeUnchanged, true, 'simulation does not advance behind the mask');
    assert.equal(masked.positionUnchanged, true);
    await page.evaluate(() => globalThis.releaseWorldMeshes());
    await page.waitForFunction(() => globalThis.worldLoadWitness.worldLoading.ready);
    await page.setViewportSize({ width: 800, height: 200 });
    await page.evaluate(async () => {
      const filler = document.createElement('div');
      filler.id = 'scroll-cue-filler';
      filler.style.minHeight = '1000px';
      document.querySelector('#overlay .card').append(filler);
      await Promise.resolve();
    });
    await page.waitForFunction(
      () => document.querySelector('#overlay')?.hidden && document.querySelector('#card-scroll-down')?.hidden,
    );
    await pressAction(page, 'ui.main-menu-toggle');
    await page.waitForFunction(() => document.querySelector('#card-scroll-down')?.hidden === false);
    await pressAction(page, 'ui.main-menu-toggle');
    await page.waitForFunction(() => document.querySelector('#overlay')?.hidden);
    await page.evaluate(() => {
      document.querySelector('#scroll-cue-filler').remove();
    });
    await page.setViewportSize({ width: 800, height: 600 });
    assert.equal(
      await page.locator('#world-loading').isVisible(),
      false,
      'the combined readiness signal clears the mask',
    );
    const canAdvance = await page.evaluate(() => {
      const { session, frame } = globalThis.worldLoadWitness;
      const { time } = session.sim;
      frame(performance.now() + 100);
      return session.sim.time > time;
    });
    assert.equal(canAdvance, true, 'the same frame driver advances simulation after the mask clears');
    const schedule = await page.evaluate(async () => {
      const { controller } = skellySaveTest;
      // The interval play bound from content; the schedule below is expressed in it.
      const interval = controller.checkpoints?.intervalSimSeconds;
      if (!(interval > 0)) {
        throw new Error(`play bound no positive checkpoint interval: ${interval}`);
      }
      let time = 0;
      let writes = 0;
      const measuredDurations = [];
      controller.storage.save = () => {
        writes += 1;
        return { generation: writes, slot: 'a', backend: 'indexeddb' };
      };
      const bindAtCurrentTime = () =>
        controller.bindSession(controller.snapshot, () => time, controller.worldOptions, {
          checkpointSimSeconds: interval,
          recordSnapshotDuration: (durationMs) => measuredDurations.push(durationMs),
        });
      bindAtCurrentTime();
      const samples = [];
      for (time of [0.999 * interval, interval, 2 * interval]) {
        controller.afterFrame();
        await new Promise((resolve) => setTimeout(resolve, 0));
        samples.push(writes);
      }
      time = interval;
      bindAtCurrentTime();
      for (time of [1.5 * interval, 2 * interval]) {
        controller.afterFrame();
        await new Promise((resolve) => setTimeout(resolve, 0));
        samples.push(writes);
      }
      time = 0;
      bindAtCurrentTime();
      time = 1.5 * interval; // the debug clock moved past the first scheduled checkpoint
      controller.rearmAutosaveAfterTimeSeek();
      const afterSeek = [];
      for (time of [1.5 * interval, 1.9 * interval, 2 * interval, 2.1 * interval]) {
        controller.afterFrame();
        await new Promise((resolve) => setTimeout(resolve, 0));
        afterSeek.push(writes);
      }
      return { samples, afterSeek, measuredDurations };
    });
    assert.deepEqual(schedule.samples, [0, 1, 2, 2, 3]);
    assert.deepEqual(schedule.afterSeek, [3, 3, 4, 4]);
    assert.equal(schedule.measuredDurations.length, 4);
    assert.ok(schedule.measuredDurations.every((duration) => Number.isFinite(duration) && duration >= 0));

    await page.evaluate(() => {
      const { controller } = skellySaveTest;
      controller.storage.save = () => Promise.reject(new DOMException('quota regression', 'QuotaExceededError'));
      controller.beforeSleep();
    });
    // The rejection settles within a few event-loop turns; a missing recovery UI fails here, not later.
    await page.waitForFunction(() => document.querySelector('#save-recovery')?.checkVisibility(), undefined, {
      timeout: 1000,
    });
    const failure = await page.evaluate(() => ({
      text: document.querySelector('#save-recovery-message').textContent,
      visible: document.querySelector('#save-recovery').checkVisibility(),
      retryHidden: document.querySelector('#save-retry').hidden,
      exportHidden: document.querySelector('#save-export-current').hidden,
    }));
    assert.match(failure.text, QUOTA_ERROR);
    assert.equal(failure.visible, true);
    assert.equal(failure.retryHidden, false);
    assert.equal(failure.exportHidden, false);

    await page.keyboard.press('Escape');
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForFunction(() => !document.pointerLockElement);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#save-export-current')]);
    assert.match(download.suggestedFilename(), CURRENT_EXPORT);
    assert.ok((await stat(await download.path())).size > 0);

    // Testers hand back metrics and a replay from the F9 card; this page runs without debug.
    assert.equal(await page.locator('#playtest-export').isVisible(), true, 'the F9 card offers the hand-back exports');
    const handBack = async (button) => {
      const [saved] = await Promise.all([page.waitForEvent('download'), page.click(button)]).catch(async (error) => {
        throw new Error(`${button}: ${await page.textContent('#playtest-export-status')}`, { cause: error });
      });
      const bytes = await readFile(await saved.path());
      assert.ok(bytes.length > 0, `${button} saves a non-empty file`);
      return bytes.toString('base64');
    };
    const files = {
      metrics: await handBack('#playtest-metrics-export'),
      replay: await handBack('#playtest-replay-export'),
    };
    const pageModules = {
      tools: '/@stage/@skelly/presentation/internal/presentation/playtestTools.ts',
      replays: '/@stage/@skelly/engine/input',
    };
    const kinds = await page.evaluate(
      async ({ metrics, replay, modules }) => {
        const bytes = (base64) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        const { loadMetrics } = await import(modules.tools);
        const { decodeInputReplay } = await import(modules.replays);
        const { seed } = globalThis.worldLoadWitness.engine.config;
        const metricsText = new TextDecoder().decode(bytes(metrics));
        return {
          metrics:
            loadMetrics(
              seed,
              { getItem: () => metricsText },
              globalThis.worldLoadWitness.engine.attemptPolicy.limits,
            ) !== undefined,
          replay: await decodeInputReplay(bytes(replay), { contentLookup: () => true }).then(
            () => true,
            (error) => String(error),
          ),
        };
      },
      { ...files, modules: pageModules },
    );
    assert.deepEqual(kinds, { metrics: true, replay: true }, 'each export reads back as its own kind of file');

    const rowless = await context.newPage();
    rowless.on('pageerror', (error) => pageErrors.push(error.message));
    const rowlessUrl = new URL(url);
    rowlessUrl.searchParams.set('site', 'weatheringTest');
    const rowlessHash = { ...readHash(rowlessUrl.hash).hash, debug: true };
    rowlessUrl.hash = writeHash(rowlessHash);
    await rowless.addInitScript((key) => {
      globalThis.metricsStorageCalls = [];
      for (const method of ['getItem', 'setItem']) {
        const original = Storage.prototype[method];
        Storage.prototype[method] = function (...args) {
          if (args[0] === key) {
            globalThis.metricsStorageCalls.push(method);
            throw new Error('rowless run accessed attempt metrics storage');
          }
          return original.apply(this, args);
        };
      }
    }, metricsStorageKey(rowlessHash.seed));
    await rowless.goto(rowlessUrl.href);
    await rowless.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await rowless.click('#go');
    await rowless.waitForFunction(() => globalThis.worldLoadWitness?.worldLoading.ready);
    const unrecorded = await rowless.evaluate(() => {
      const witness = globalThis.gauntletWitness;
      witness.manual = true;
      globalThis.worldLoadWitness.frame(performance.now() + 10_000);
      const measurement = witness.measureSnapshot();
      return {
        policy: witness.engine.attemptPolicy,
        recorderAbsent: witness.recording === undefined,
        storageCalls: globalThis.metricsStorageCalls,
        diagnosticWorked: measurement.batchCount > 0 && measurement.netStateUnchanged,
      };
    });
    assert.equal(unrecorded.policy, undefined);
    assert.equal(unrecorded.recorderAbsent, true, 'a rowless run allocates no attempt recorder');
    assert.deepEqual(unrecorded.storageCalls, [], 'neither startup nor periodic frames access metrics storage');
    assert.equal(unrecorded.diagnosticWorked, true, 'snapshot diagnostics remain available without a recorder');
    assert.equal(await rowless.locator('#playtest-metrics-export').isDisabled(), true);
    assert.equal(await rowless.locator('#playtest-replay-export').isEnabled(), true);
    await rowless.close();

    await page.evaluate(() => {
      skellySaveTest.controller.storage.save = async () => ({ generation: 99, slot: 'a', backend: 'indexeddb' });
    });
    await page.click('#save-retry');
    await page.waitForFunction(
      () => !skellySaveTest.controller.failure && skellySaveTest.controller.savedGeneration === 99,
    );
    assert.deepEqual(pageErrors, []);

    const faultPage = await context.newPage();
    await faultPage.goto(url);
    await faultPage.waitForFunction(() => globalThis.skellySaveTest?.controller.ready);
    await faultPage.evaluate(() => {
      globalThis.holdWorldMeshes = true;
    });
    await faultPage.click('#go');
    await faultPage.waitForFunction(() => Boolean(globalThis.worldLoadWitness));
    await faultPage.evaluate(() => globalThis.failWorldMesh());
    await faultPage.waitForFunction(() => globalThis.worldLoadWitness.worldLoading.state === 'failed');
    assert.equal(await faultPage.locator('#world-loading').isVisible(), true, 'failed loading never exposes the scene');
    assert.equal(await faultPage.locator('#world-loading-reload').isVisible(), true, 'failed loading offers recovery');
    assert.match(await faultPage.locator('#world-loading-message').textContent(), LOADING_WORKER_FAILURE);
  });

  await test('retry saves the latest capture rather than restoring an older failed snapshot', async () => {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => globalThis.skellySaveTest?.controller.ready, undefined, { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.click('#go');
    await page.waitForFunction(() => globalThis.saveControllerPlayStarted === true);

    const race = await page.evaluate(async () => {
      const { controller, storage } = skellySaveTest;
      const realSave = Object.getPrototypeOf(storage).save.bind(storage);
      const sourceSnapshot = controller.snapshot;
      let health = 90;
      let time = 0;
      let calls = 0;
      let releaseSecond;
      const secondWrite = new Promise((resolve) => {
        releaseSecond = resolve;
      });
      const latestSnapshot = () => {
        const snapshot = structuredClone(sourceSnapshot());
        snapshot.character.simulation.body.health = health;
        return snapshot;
      };
      controller.bindSession(latestSnapshot, () => time, controller.worldOptions, {
        checkpointSimSeconds: controller.checkpoints.intervalSimSeconds,
      });
      storage.save = async (saveNamespace, encode) => {
        calls += 1;
        const call = calls;
        if (call === 1) {
          throw new DOMException('retry race quota', 'QuotaExceededError');
        }
        if (call === 2) {
          await secondWrite;
        }
        return realSave(saveNamespace, encode);
      };

      controller.beforeSleep();
      for (let attempt = 0; controller.writing && attempt < 200; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      if (controller.writing) {
        throw new Error('The refused save did not settle');
      }
      health = 60;
      time = 1;
      controller.beforeSleep();
      for (let attempt = 0; calls < 2 && attempt < 200; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      if (calls < 2) {
        throw new Error('The retry save did not begin');
      }
      health = 30;
      time = 2;
      controller.beforeSleep();
      const queuedBeforeRetry = controller.queued.snapshot.character.simulation.body.health;
      globalThis.skellyRetryRace = { releaseSecond };
      return { queuedBeforeRetry };
    });

    await page.keyboard.press('Escape');
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForFunction(() => !document.pointerLockElement);
    await page.click('#save-retry');
    const retryState = await page.evaluate(() => ({
      failure: skellySaveTest.controller.failure,
      queuedHealth: skellySaveTest.controller.queued.snapshot.character.simulation.body.health,
    }));
    assert.equal(retryState.failure, '');
    assert.equal(retryState.queuedHealth, 30);
    await page.evaluate(() => {
      globalThis.skellyRetryRace.releaseSecond();
      globalThis.skellyRetryRace = undefined;
    });
    await page.waitForFunction(
      () => !(skellySaveTest.controller.writing || skellySaveTest.controller.queued),
      undefined,
      { timeout: 30_000 },
    );
    const saved = await page.evaluate(async () => {
      const { controller, storage, namespace } = skellySaveTest;
      const loaded = await storage.load(namespace);
      return {
        payload: Array.from(loaded.payload),
        identity: controller.identityValue.components,
      };
    });
    const decoded = await decodeSave(Uint8Array.from(saved.payload), {
      version: saved.identity,
      contentLookup: () => true,
    });
    assert.equal(race.queuedBeforeRetry, 30);
    assert.equal(decoded.snapshot.character.simulation.body.health, 30);
    assert.deepEqual(pageErrors, []);
    await context.close();
  });

  await test('a debug run neither writes nor loads a save unless save is also set', async () => {
    const withHash = (extra) => {
      const target = new URL(url);
      target.hash = writeHash({ ...readHash(target.hash).hash, ...extra });
      return target.href;
    };
    const enterAndCheckpoint = async (page) => {
      await page.waitForFunction(() => globalThis.skellySaveTest?.controller.ready, undefined, { timeout: 30_000 });
      await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
      await page.click('#go');
      await page.waitForFunction(() => globalThis.saveControllerPlayStarted === true);
      return page.evaluate(async () => {
        const { controller, storage } = skellySaveTest;
        controller.beforeSleep();
        for (let attempt = 0; (controller.writing || controller.queued) && attempt < 400; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        if (controller.writing || controller.queued) {
          throw new Error('The checkpoint did not settle');
        }
        return { namespaces: await storage.listNamespaces(), canSave: controller.canSaveCurrentGame };
      });
    };
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    await context.addInitScript(() => {
      globalThis.saveControllerFrames = 0;
      const countFrame = () => {
        globalThis.saveControllerFrames += 1;
        requestAnimationFrame(countFrame);
      };
      requestAnimationFrame(countFrame);
    });
    try {
      const pageErrors = [];
      const debugPage = await context.newPage();
      debugPage.on('pageerror', (error) => pageErrors.push(error.message));
      await debugPage.goto(withHash({ debug: true }));
      await debugPage.waitForFunction(() => globalThis.skellySaveTest?.controller.ready, undefined, {
        timeout: 30_000,
      });
      // With no save, the new character choice and its start button still lead the card, above the controls list.
      const order = await debugPage.evaluate(() => {
        const box = (id) => document.getElementById(id).getBoundingClientRect();
        const list = box('controls-search');
        return ['new-character-options', 'go'].map((id) => {
          const rect = box(id);
          return { id, shown: rect.height > 0, beforeList: rect.bottom <= list.top };
        });
      });
      assert.deepEqual(order, [
        { id: 'new-character-options', shown: true, beforeList: true },
        { id: 'go', shown: true, beforeList: true },
      ]);
      assert.equal(await debugPage.locator('#title-prompt').isVisible(), true, 'fresh title has a centre start prompt');
      const unsaved = await enterAndCheckpoint(debugPage);
      assert.deepEqual(unsaved, { namespaces: [], canSave: false });
      await debugPage.close();

      const savingPage = await context.newPage();
      savingPage.on('pageerror', (error) => pageErrors.push(error.message));
      await savingPage.goto(withHash({ debug: true, save: true }));
      const saved = await enterAndCheckpoint(savingPage);
      assert.equal(saved.canSave, true);
      assert.equal(saved.namespaces.length, 1);
      await savingPage.close();

      const refusedPage = await context.newPage();
      await refusedPage.addInitScript((namespace) => {
        sessionStorage.setItem(`skelly.restore-refusal:${namespace}`, 'Refused save fixture');
      }, saved.namespaces[0]);
      await refusedPage.goto(withHash({ debug: true, save: true }));
      await refusedPage.waitForFunction(() => globalThis.skellySaveTest?.controller.ready, undefined, {
        timeout: 30_000,
      });
      const refusalHint = refusedPage.locator('#save-refusal-hint');
      assert.equal(await refusalHint.isVisible(), true, 'a refused save leaves a visible centre hint');
      assert.match(await refusalHint.textContent(), REFUSED_SAVE_FIXTURE, 'the centre hint repeats the refusal');
      assert.equal(
        await refusalHint.evaluate((hint) => {
          const overlay = document.querySelector('#overlay');
          return Number(getComputedStyle(hint).zIndex) > Number(getComputedStyle(overlay).zIndex);
        }),
        true,
        'the centre hint paints above the refused-save overlay',
      );
      const hintPosition = await refusalHint.evaluate((hint) => {
        const bounds = hint.getBoundingClientRect();
        return {
          x: bounds.left + bounds.width / 2,
          y: bounds.top + bounds.height / 2,
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
        };
      });
      assert.ok(Math.abs(hintPosition.x - hintPosition.viewportWidth / 2) < hintPosition.viewportWidth / 4);
      assert.ok(Math.abs(hintPosition.y - hintPosition.viewportHeight / 2) < hintPosition.viewportHeight / 4);
      await refusedPage.close();

      const reloaded = await context.newPage();
      reloaded.on('pageerror', (error) => pageErrors.push(error.message));
      await reloaded.goto(withHash({ debug: true }));
      await reloaded.waitForFunction(() => globalThis.skellySaveTest?.controller.ready, undefined, {
        timeout: 30_000,
      });
      assert.equal(await reloaded.evaluate(() => skellySaveTest.controller.restored === undefined), true);
      assert.equal(await reloaded.locator('#continue').isHidden(), true);
      const disabled = await reloaded.evaluate(async () => {
        const { controller, storage } = skellySaveTest;
        const status = document.querySelector('#save-status');
        const before = status.textContent;
        let storageTouched = false;
        for (const method of ['requestPersistence', 'status']) {
          storage[method] = () => {
            storageTouched = true;
            return Promise.resolve(undefined);
          };
        }
        const persist = document.querySelector('#save-persist');
        const { hidden } = persist;
        const inputFrame = globalThis.saveControllerFrames;
        persist.click();
        while (globalThis.saveControllerFrames <= inputFrame) {
          await new Promise(requestAnimationFrame);
        }
        return {
          showsDebugMessage: before.includes(controller.text.debugRun),
          unchanged: status.textContent === before,
          hidden,
          storageTouched,
        };
      });
      assert.deepEqual(disabled, { showsDebugMessage: true, unchanged: true, hidden: true, storageTouched: false });
      assert.deepEqual(pageErrors, []);
    } finally {
      await context.close();
    }
  });
} finally {
  await browser.close();
  await server.close();
}
