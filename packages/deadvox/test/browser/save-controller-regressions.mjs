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
import { launchChromium } from './chromium.mjs';
import { gauntletFlow } from './gauntlet-flow.mjs';
import { pressAction } from './input-actions.mjs';
import { browserStageUrl } from './stage-mode.mjs';
import { installWorldMeshControl } from './world-mesh-fixture.mjs';

const root = resolvePath(fileURLToPath(new URL('../..', import.meta.url)));
const { createServer } = await import('vite');
const { decodeSave } = await import(pathToFileURL(`${root}/src/core/saveFormat.ts`));
const observation = {
  name: 'save-controller-game-ready',
  enforce: 'pre',
  transform(code, id) {
    if (id.endsWith('/src/game/worldSetup.ts')) {
      // The scenario as it enters kind dispatch, so the fixture holds whichever site the kind builds.
      const marker = 'const scenario = registry.scenarios.get(config.site);';
      assert(code.includes(marker), 'scenario population fixture admission point exists');
      return code.replace(
        marker,
        "const scenario = ((found) => found && new URLSearchParams(location.search).get('route-fixture') === '1' ? { ...found, population: { ...found.population, settlementPressure: false, authoredMarkers: false } } : found)(registry.scenarios.get(config.site));",
      );
    }
    if (id.endsWith('/src/ui/saveController.ts')) {
      return code.replace(
        '    this.environmentProblem = saveEnvironmentProblem();',
        '    globalThis.saveControllerConstructed = true;\n    this.environmentProblem = saveEnvironmentProblem();',
      );
    }
    if (!id.endsWith('/src/game/play.ts')) {
      return;
    }
    const marker = '  startRealFrames(frame);';
    assert(code.includes(marker), 'game-ready observation point exists');
    return code.replace(
      marker,
      '  Object.assign(globalThis, { saveControllerPlayStarted: true, worldLoadWitness: { engine, session, worldLoading, frame }, tutorialSession: options.tutorial ? session : undefined, gauntletWitness: { engine, session, input, eye, lookedAt, manual: false } });\n  startRealFrames((now) => globalThis.gauntletWitness.manual ? true : frame(now));',
    );
  },
};
const server = await createServer({
  root,
  configFile: `${root}/vite.config.ts`,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
  plugins: [observation],
});
await server.listen();
const browser = await launchChromium('save-controller-regressions', { headless: true });
const address = server.httpServer.address();
assert(address && typeof address !== 'string');
const url = browserStageUrl(
  'save-controller-regressions',
  `http://127.0.0.1:${address.port}/?seed=73&radius=32&site=testHouse&actors=boxes&post=0&sunshadow=0&torchshadow=0&save-test=1&save-backend=indexeddb`,
);
const QUOTA_ERROR = /quota regression/i;
const BEST_EFFORT = /best.effort/i;
const PERSISTENCE_GRANTED = /Persistent storage granted/;
const CURRENT_EXPORT = /^deadvox-current-.*\.bin$/;
const BASE_MISMATCH = /Generated base mismatch/;
const REPLAY_REJECTED = /^Replay rejected:/;
const LOADING_WORKER_FAILURE = /Controlled loading worker failure/;

try {
  await test('gauntlet discovery, resources and ordinary traversal preserve running, won and dead save boundaries', async () => {
    await gauntletFlow(browser, url);
  });

  await test('practice launch, lifecycle and death leave the normal save untouched and exit returns to start', async () => {
    const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
    try {
      const page = await context.newPage();
      await page.goto(url);
      await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready);
      await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
      await page.click('#go');
      await page.waitForFunction(() => globalThis.saveControllerPlayStarted === true);
      await page.waitForFunction(() => !(deadvoxSaveTest.controller.writing || deadvoxSaveTest.controller.queued));
      const saved = await page.evaluate(async () => {
        const { controller, storage, namespace } = deadvoxSaveTest;
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
      await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready);
      await page.click('#tutorial-start');
      await page.waitForFunction(() => globalThis.tutorialSession !== undefined);
      assert.equal(
        await page.evaluate(() => Boolean(globalThis.saveControllerConstructed)),
        false,
        'practice never creates a persistence owner',
      );
      await page.locator('#go').waitFor({ state: 'visible' });
      const binding = await page.evaluate(async () => {
        const { inputBindings } = await import('/src/game/inputBindings.ts');
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
        const { inputBindings } = await import('/src/game/inputBindings.ts');
        const cap = document.querySelector(`[data-tutorial-action="${id}"] kbd`);
        return cap?.textContent === inputBindings.label(id) && cap.textContent !== previous;
      }, binding);
      await page.getByRole('button', { name: 'Practice controls', exact: true }).press('Enter');
      assert.equal(
        await page.evaluate(async () => {
          const { controlsCardRows, filterControlsCardRows } = await import('/src/game/controls.ts');
          const search = document.querySelector('#controls-search');
          const expected = filterControlsCardRows(controlsCardRows(), search.value).map(({ id }) => id);
          const actual = [...document.querySelectorAll('#controls [data-input-action]')].map(
            (row) => row.dataset.inputAction,
          );
          return (
            search === document.activeElement &&
            search.value.trim() !== '' &&
            expected.length > 0 &&
            expected.length < controlsCardRows().length &&
            JSON.stringify(actual) === JSON.stringify(expected) &&
            expected.includes('movement.forward')
          );
        }),
        true,
        'practice opens the shared controls card on the movement topic',
      );
      await page.evaluate(async ({ id, original }) => {
        const { inputBindings } = await import('/src/game/inputBindings.ts');
        if (inputBindings.rebind(id, original) !== undefined) {
          throw new Error('Binding restoration failed');
        }
      }, binding);
      const canHints = await page.evaluate(async () => {
        const { Tutorial } = await import('/src/game/tutorial.ts');
        const { mountTutorial } = await import('/src/ui/tutorial.ts');
        const { Inventory } = await import('/src/core/inventory.ts');
        const { HandlingQueue } = await import('/src/core/handling.ts');
        const { Unpacking } = await import('/src/game/unpacking.ts');
        const { dominantSide } = await import('/src/core/character.ts');
        const { inputBindings } = await import('/src/game/inputBindings.ts');
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
        const lootTutorial = new Tutorial([0, 0, 0], 0, { x0: 20, x1: 21, z0: 20, z1: 21 }, () => undefined);
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
        const tutorial = new Tutorial([0, 0, 0], 0, { x0: 20, x1: 21, z0: 20, z1: 21 }, () => undefined);
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
        const unpacking = new Unpacking(
          inventory,
          queue,
          () => [0, 0, 0],
          (type) => tutorial.opened(type),
        );
        gauntletWitness.manual = true;
        try {
          const draw = mountTutorial(
            tutorial,
            () => undefined,
            () => undefined,
          );
          const actions = () =>
            [...document.querySelectorAll('#tutorial-objective [data-tutorial-action]')].map(
              (node) => node.dataset.tutorialAction,
            );
          mountTutorial(
            lootTutorial,
            () => undefined,
            () => undefined,
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
            stage: tutorial.stage,
          };
        } finally {
          gauntletWitness.manual = false;
        }
      });
      const lootActions = [
        'inventory.previous',
        'inventory.next',
        'inventory.best-pocket',
        'inventory.hands',
        'inventory.wear',
        'inventory.search',
        'inventory.quick-action-gate',
        'hand.use-dominant',
      ];
      assert(
        lootActions.every((id) => canHints.loot.includes(id)),
        'open inventory covers each loot action',
      );
      assert(
        lootActions.every((id) => canHints.lootCaps[id] === canHints.labels[id]),
        'open inventory loot actions use their live registry labels',
      );
      assert(canHints.sealed.includes('hand.use-off'), 'the held opener points to its hand activation');
      assert(canHints.opened.includes('ui.inventory-toggle'), 'open inventory owns input before eating');
      assert(canHints.eating.includes('hand.use-dominant'), 'held food points back to hand activation');
      assert.equal(canHints.stage, 'eat', 'opening and wielding alone are not consumption');
      await page.click('#go');
      await page.waitForFunction(() => globalThis.tutorialSession.sim.paused === false);
      await page.evaluate(() => {
        document.dispatchEvent(new Event('visibilitychange'));
        globalThis.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
        tutorialSession.sim.body.damageHealth(tutorialSession.sim.body.health);
      });
      await page.waitForFunction(() => !document.querySelector('#death').hidden);
      const after = await page.evaluate(async (namespace) => {
        const { SaveStorage } = await import('/src/game/saveStorage.ts');
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
        await page.evaluate((namespace) => sessionStorage.getItem(`deadvox.dead-world:${namespace}`), saved.namespace),
        null,
      );
      // Native pointer activation of the practice exits is quarantined in #705; its root cause is unresolved.
      await Promise.all([
        page.waitForURL((target) => !target.searchParams.has('tutorial'), { waitUntil: 'commit' }),
        page.locator('#death button').press('Enter'),
      ]);
      await page.waitForFunction(
        () => document.querySelector('#tutorial-start') && document.querySelector('#startup-screen').hidden,
      );
      assert.equal(await page.locator('#tutorial-start').isVisible(), true);
      assert.equal(await page.locator('#continue').isEnabled(), true);
      await page.click('#tutorial-start');
      await page.waitForFunction(() => globalThis.tutorialSession !== undefined);
      await Promise.all([
        page.waitForURL((target) => !target.searchParams.has('tutorial'), { waitUntil: 'commit' }),
        page.getByRole('button', { name: 'Exit practice', exact: true }).press('Enter'),
      ]);
      await page.waitForFunction(() => document.querySelector('#startup-screen').hidden);
      assert.equal(await page.locator('#continue').isEnabled(), true);
    } finally {
      await context.close();
    }
  });

  await test('rejected pending replay reveals its error instead of leaving the loading screen up', async () => {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    try {
      await context.addInitScript(() => {
        sessionStorage.setItem('deadvox.pending-replay', btoa('not a replay'));
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
      await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready, undefined, { timeout: 30_000 });
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
      assert.equal(await page.evaluate(() => globalThis.deadvoxSaveTest.controller.storageStatus.persistent), true);
      assert.equal(
        await page.evaluate(async () => (await globalThis.deadvoxSaveTest.storage.status()).persistent),
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
            globalThis.deadvoxSaveTest?.controller &&
            !globalThis.deadvoxSaveTest.controller.ready,
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
        () => globalThis.deadvoxSaveTest?.controller.ready && document.querySelector('#startup-screen').hidden,
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
      assert.equal(await page.evaluate(() => globalThis.deadvoxSaveTest.controller.storageStatus.persistent), true);
      assert.equal(
        await page.evaluate(async () => (await globalThis.deadvoxSaveTest.storage.status()).persistent),
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
    await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready, undefined, { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    const radiusLinks = await page.locator('[data-view-distance]').evaluateAll((links) =>
      links.map((link) => {
        const expected = new URL(location.href);
        expected.searchParams.set('radius', link.dataset.viewDistance);
        return new URL(link.href).href === expected.href;
      }),
    );
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
      hasSnapshot: typeof deadvoxSaveTest.controller.snapshot === 'function',
      entered: deadvoxSaveTest.controller.isEntered,
    }));
    assert.deepEqual(before, { hasSnapshot: false, entered: false });
    await pressAction(page, 'ui.inventory-toggle');
    await pressAction(page, 'movement.forward');
    await page.keyboard.press('F10');
    const after = await page.evaluate(() => ({
      hasSnapshot: typeof deadvoxSaveTest.controller.snapshot === 'function',
      entered: deadvoxSaveTest.controller.isEntered,
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
      const { controller } = deadvoxSaveTest;
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

    await page.evaluate(async () => {
      const { controller } = deadvoxSaveTest;
      controller.storage.save = () => Promise.reject(new DOMException('quota regression', 'QuotaExceededError'));
      controller.beforeSleep();
      await new Promise((resolve) => setTimeout(resolve, 20));
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
    const pageModules = { tools: '/src/game/playtestTools.ts', replays: '/src/game/inputReplay.ts' };
    const kinds = await page.evaluate(
      async ({ metrics, replay, modules }) => {
        const bytes = (base64) => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        const { loadMetrics } = await import(modules.tools);
        const { decodeInputReplay } = await import(modules.replays);
        const seed = Number(new URLSearchParams(location.search).get('seed'));
        const metricsText = new TextDecoder().decode(bytes(metrics));
        return {
          metrics: loadMetrics(seed, { getItem: () => metricsText }) !== undefined,
          replay: await decodeInputReplay(bytes(replay), { contentLookup: () => true }).then(
            () => true,
            (error) => String(error),
          ),
        };
      },
      { ...files, modules: pageModules },
    );
    assert.deepEqual(kinds, { metrics: true, replay: true }, 'each export reads back as its own kind of file');

    await page.evaluate(() => {
      deadvoxSaveTest.controller.storage.save = async () => ({ generation: 99, slot: 'a', backend: 'indexeddb' });
    });
    await page.click('#save-retry');
    await page.waitForFunction(
      () => !deadvoxSaveTest.controller.failure && deadvoxSaveTest.controller.savedGeneration === 99,
    );
    assert.deepEqual(pageErrors, []);

    const faultPage = await context.newPage();
    await faultPage.goto(url);
    await faultPage.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready);
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
    await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready, undefined, { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.click('#go');
    await page.waitForFunction(() => globalThis.saveControllerPlayStarted === true);

    const race = await page.evaluate(async () => {
      const { controller, storage } = deadvoxSaveTest;
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
      health = 60;
      time = 1;
      controller.beforeSleep();
      for (let attempt = 0; calls < 2 && attempt < 200; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      health = 30;
      time = 2;
      controller.beforeSleep();
      const queuedBeforeRetry = controller.queued.snapshot.character.simulation.body.health;
      globalThis.deadvoxRetryRace = { releaseSecond };
      return { queuedBeforeRetry };
    });

    await page.keyboard.press('Escape');
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForFunction(() => !document.pointerLockElement);
    await page.click('#save-retry');
    const retryState = await page.evaluate(() => ({
      failure: deadvoxSaveTest.controller.failure,
      queuedHealth: deadvoxSaveTest.controller.queued.snapshot.character.simulation.body.health,
    }));
    assert.equal(retryState.failure, '');
    assert.equal(retryState.queuedHealth, 30);
    await page.evaluate(() => {
      globalThis.deadvoxRetryRace.releaseSecond();
      globalThis.deadvoxRetryRace = undefined;
    });
    await page.waitForFunction(
      () => !(deadvoxSaveTest.controller.writing || deadvoxSaveTest.controller.queued),
      undefined,
      { timeout: 30_000 },
    );
    const saved = await page.evaluate(async () => {
      const { controller, storage, namespace } = deadvoxSaveTest;
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

  await test('actual Continue refuses a generated-base mismatch and reloads with a recovery diagnosis', async () => {
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready, undefined, { timeout: 30_000 });
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.click('#go');
    await page.waitForFunction(() => globalThis.saveControllerPlayStarted === true);
    await page.evaluate(async () => {
      const { controller, storage, namespace } = deadvoxSaveTest;
      const snapshot = structuredClone(controller.snapshot());
      const { pos } = snapshot.character.player.body;
      snapshot.world.diffs.chunks = [
        {
          cx: Math.floor(pos[0] / 32),
          cy: -3,
          cz: Math.floor(pos[2] / 32),
          cells: [{ index: 0, base: 'air', id: 'stone' }],
        },
      ];
      await storage.save(namespace, (generation) =>
        storage.encodeSnapshot(snapshot, generation, {
          worldOptions: controller.worldOptions,
          version: controller.identityValue.components,
          buildRevision: controller.identityValue.buildRevision,
        }),
      );
      controller.entered = false;
    });

    await page.reload();
    await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready, undefined, { timeout: 30_000 });
    await page.waitForFunction(() => !document.querySelector('#continue').disabled, undefined, { timeout: 30_000 });
    let refusalReload;
    const nextReload = new Promise((resolve, reject) => {
      let navigations = 0;
      const onNavigation = (frame) => {
        if (frame === page.mainFrame()) {
          navigations += 1;
          if (navigations === 2) {
            clearTimeout(refusalReload);
            page.off('framenavigated', onNavigation);
            resolve();
          }
        }
      };
      page.on('framenavigated', onNavigation);
      refusalReload = setTimeout(() => {
        page.off('framenavigated', onNavigation);
        reject(new Error('saved-world refusal did not reload to the recovery title'));
      }, 30_000);
    });
    await Promise.all([page.waitForNavigation(), page.click('#continue')]);
    await nextReload;
    await page.waitForFunction(
      () => {
        const saveTest = globalThis.deadvoxSaveTest;
        const status = document.querySelector('#save-status')?.textContent ?? '';
        return (
          saveTest?.controller.ready &&
          status.includes('Saved world unreadable and left untouched') &&
          sessionStorage.getItem(`deadvox.restore-refusal:${saveTest.namespace}`)
        );
      },
      undefined,
      { timeout: 30_000 },
    );
    const state = await page.evaluate(() => ({
      status: document.querySelector('#save-status').textContent,
      disabled: document.querySelector('#continue').disabled,
      refusal: sessionStorage.getItem(`deadvox.restore-refusal:${deadvoxSaveTest.namespace}`),
    }));
    assert.match(state.status, BASE_MISMATCH);
    assert.equal(state.disabled, true);
    assert.match(state.refusal, BASE_MISMATCH);
    assert.deepEqual(pageErrors, []);
    await context.close();
  });
} finally {
  await browser.close();
  await server.close();
}
