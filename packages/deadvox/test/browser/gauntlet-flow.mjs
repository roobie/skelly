// biome-ignore-all lint/correctness/noNodejsModules: browser-flow contract uses Node assertions.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone browser contract.
// biome-ignore-all lint/performance/noAwaitInLoops: route segments and save boundaries run in order.
import assert from 'node:assert/strict';
import { readHash, writeHash } from '../../src/hashState.ts';
import { holdAction, pressAction } from './input-actions.mjs';
import { installSaveStatusTrace, saveLockSnapshot } from './save-lock-diagnostics.mjs';
import { installWorldMeshControl } from './world-mesh-fixture.mjs';

/**
 * @import { Browser } from 'playwright'
 * @import { ScenarioComposition } from '@skelly/engine/internal/core/scenarioComposition.ts'
 * @import { HandSide } from '@skelly/engine/inventory'
 * @import { Vec3 } from '@skelly/engine/world'
 */
/** @typedef {ScenarioComposition['seals'][number]} Seal */
/** @typedef {{ readonly upper: Readonly<Vec3>, readonly lower: Readonly<Vec3>, readonly ladder?: Readonly<Vec3> }} Connection */

// Each flow drops the base address's start mod, which would win over this scenario's default start.
const GAUNTLET_PLAY = 'skelly.deadvox.scenario.gauntlet.play';

/**
 * The stage address hash with debug saves on and the base address's actors dropped.
 * @param {string} fragment
 */
const gauntletHash = (fragment) => {
  const read = readHash(fragment);
  if ('refused' in read) {
    throw new Error(`The stage address hash is refused: ${read.refused}`);
  }
  const { actors: _actors, ...hash } = read.hash;
  return writeHash({ ...hash, debug: true, save: true });
};

/** Turns on the scenario population fixture that `save-controller-fixture.mjs` injects. */
const useRouteFixture = () => {
  globalThis.skellyRouteFixture = true;
};

/**
 * @param {Browser} browser
 * @param {string} baseUrl
 */
const gauntletLoading = async (browser, baseUrl) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  try {
    await context.addInitScript(installWorldMeshControl);
    const page = await context.newPage();
    /** @type {string[]} */
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const url = new URL(baseUrl);
    url.searchParams.delete('start-mod');
    url.searchParams.set('mods', GAUNTLET_PLAY);
    url.hash = gauntletHash(url.hash);
    await page.goto(url.href);
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.evaluate(() => {
      globalThis.holdWorldMeshes = true;
    });
    await page.click('#go');
    await page.waitForFunction(() => globalThis.skellyPlayTest && document.pointerLockElement !== null);
    assert.equal(await page.locator('#world-loading').isVisible(), true, 'gauntlet creation is masked');
    const masked = await page.evaluate(async () => {
      const { realTimestamp } = await import('/@stage/@skelly/engine/sim');
      const { session, worldLoading, engine, frame } = globalThis.skellyPlayTest;
      const elapsed = () => {
        const run = session.scenarioRun;
        if (!run) {
          throw new Error('The gauntlet session has no scenario run');
        }
        return run.activeRealSeconds;
      };
      const before = {
        time: session.sim.time,
        position: [...session.body.pos],
        elapsed: elapsed(),
      };
      const now = performance.now();
      for (let step = 1; step <= 3; step++) {
        frame(realTimestamp(now + step * 100));
      }
      return {
        ready: worldLoading.ready,
        paused: session.sim.paused,
        pending: engine.streamer.unmeshedColumns(session.body.pos[0], session.body.pos[2], engine.config.radiusChunks),
        before,
        after: {
          time: session.sim.time,
          position: [...session.body.pos],
          elapsed: elapsed(),
        },
      };
    });
    assert.equal(masked.ready, false);
    assert.equal(masked.paused, true);
    assert(masked.pending > 0, 'gauntlet has actual outstanding mesh work');
    assert.deepEqual(masked.after, masked.before, 'simulation, position and scenario elapsed time remain frozen');
    await page.evaluate(() => globalThis.releaseWorldMeshes());
    await page.waitForFunction(() => globalThis.skellyPlayTest.worldLoading.ready);
    assert.equal(await page.locator('#world-loading').isVisible(), false, 'gauntlet readiness reveals the scene');
    const advancing = await page.evaluate(async () => {
      const { realTimestamp } = await import('/@stage/@skelly/engine/sim');
      const { session, frame } = globalThis.skellyPlayTest;
      const elapsed = () => {
        const run = session.scenarioRun;
        if (!run) {
          throw new Error('The gauntlet session has no scenario run');
        }
        return run.activeRealSeconds;
      };
      const { time } = session.sim;
      const before = elapsed();
      frame(realTimestamp(performance.now() + 100));
      return session.sim.time > time && elapsed() > before;
    });
    assert.equal(advancing, true, 'gauntlet simulation and run clock resume after readiness');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
};

/**
 * @param {Browser} browser
 * @param {string} baseUrl
 */
export const gauntletFlow = async (browser, baseUrl) => {
  await gauntletLoading(browser, baseUrl);
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  try {
    await context.addInitScript(installSaveStatusTrace);
    await context.addInitScript(useRouteFixture);
    const page = await context.newPage();
    const url = new URL(baseUrl);
    url.searchParams.delete('start-mod');
    url.searchParams.set('mods', GAUNTLET_PLAY);
    url.hash = gauntletHash(url.hash);
    await page.goto(url.href);
    await page.waitForFunction(() => globalThis.skellySaveTest?.saveState().ready);
    await page.click('#go');
    await page.waitForFunction(
      () =>
        globalThis.skellyPlayTest?.worldLoading.ready &&
        globalThis.skellyPlayTest.input.locked &&
        !globalThis.skellyPlayTest.input.menuPointer &&
        !globalThis.skellyPlayTest.session.sim.paused,
    );
    await pressAction(page, 'debug.panel-toggle');
    const releaseDebugGate = await holdAction(page, 'debug.gate');
    const toolsHeader = page.locator('[data-group="tools"] .debug-group-header');
    if ((await toolsHeader.getAttribute('aria-expanded')) === 'false') {
      await toolsHeader.click();
    }
    const kitControl = page.locator('[data-group="tools"] #debug-kit-overlay');
    await kitControl.waitFor();
    if ((await kitControl.evaluate((node) => getComputedStyle(node).position)) === 'fixed') {
      throw new Error('Debug kit control is a fixed overlay again');
    }
    await kitControl.locator('button').evaluate((button) => button.scrollIntoView({ block: 'center' }));
    await kitControl.locator('button').evaluate((/** @type {HTMLButtonElement} */ button) => {
      const { input } = globalThis.skellyPlayTest;
      const bounds = button.getBoundingClientRect();
      input.moveMenuCursor(
        bounds.left + bounds.width / 2 - input.cursorX,
        bounds.top + bounds.height / 2 - input.cursorY,
      );
      button.click();
    });
    await releaseDebugGate();
    await page.evaluate(() => {
      const w = globalThis.skellyPlayTest;
      const { engine } = w;
      const placements = (engine.site?.authoredPlacements ?? []).filter((item) => item.template.ownership);
      const selected = placements.findIndex((item) => item.template.reserved?.includes(1));
      const template = placements[selected]?.template;
      if (!template?.reserved) {
        throw new Error('No compiled reserved void to inspect');
      }
      const placementInput = document.querySelector('#debug-kit-overlay [aria-label="Kit placement"]');
      const layer = document.querySelector('#debug-kit-overlay [aria-label="Kit layer"]');
      const canvas = document.querySelector('#debug-kit-overlay canvas');
      const pre = document.querySelector('#debug-kit-overlay pre');
      if (!(placementInput instanceof HTMLInputElement && layer instanceof HTMLInputElement && canvas && pre)) {
        throw new Error('The debug kit overlay lacks its placement, layer, canvas or detail');
      }
      placementInput.value = String(selected);
      placementInput.dispatchEvent(new Event('change'));
      const index = template.reserved.indexOf(1);
      const x = index % template.size[0];
      const z = Math.floor(index / template.size[0]) % template.size[2];
      const y = Math.floor(index / (template.size[0] * template.size[2]));
      layer.value = String(y);
      layer.dispatchEvent(new Event('change'));
      const rect = canvas.getBoundingClientRect();
      const cellX = rect.left + ((x + 0.5) * rect.width) / template.size[0];
      const cellY = rect.top + ((z + 0.5) * rect.height) / template.size[2];
      w.input.moveMenuCursor(cellX - w.input.cursorX, cellY - w.input.cursorY);
      canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: cellX, clientY: cellY }));
      const detail = pre.textContent;
      const record = template.provenance?.[index];
      if (!record) {
        throw new Error('Reserved cell lacks compiler provenance');
      }
      for (const field of /** @type {const} */ (['owner', 'source', 'variant'])) {
        if (!detail.includes(`${field} ${record[field]}`)) {
          throw new Error(`Overlay differs from compiler ${field}`);
        }
      }
      if (!detail.includes('reserved void yes')) {
        throw new Error('Overlay lost reserved void');
      }
    });
    await pressAction(page, 'debug.panel-toggle');
    await page.evaluate(async () => {
      const w = globalThis.skellyPlayTest;
      const { engine, session, input } = w;
      const { placedPieces } = await import('/@stage/@skelly/engine/internal/core/templates.ts');
      const { furnitureSurfacePosition } = await import('/@stage/@skelly/engine/internal/core/furnitureSurface.ts');
      const { scenarioCertificate } = await import('/@stage/@skelly/engine/internal/core/scenarioCertificate.ts');
      const { routeDoorOpener } = await import('/test/browser/gauntlet-doors.mjs');
      const openDoors = routeDoorOpener(engine, session);
      const { leaveRoof } = await import('/test/fixtures/scenarioStart.ts');
      const { CitySite } = await import('/@stage/@skelly/engine/internal/core/citySite.ts');
      const publicLead = () => {
        const { site } = engine;
        if (!(site instanceof CitySite)) {
          throw new Error('The gauntlet site is not a city site');
        }
        const { composition } = site.plan;
        const [lead] = composition?.leads ?? [];
        const leadFace = composition?.leadFaces?.[0];
        if (!(composition?.start && lead && leadFace)) {
          throw new Error('The gauntlet plan lacks a start, a public lead or its face');
        }
        return { site, start: composition.start, lead, leadFace };
      };
      const { site, start, lead, leadFace } = publicLead();
      const certificate = scenarioCertificate(site);
      /** @type {Readonly<Vec3> | undefined} */
      let foot;
      const { IDLE } = await import('/@stage/@skelly/engine/session');
      const [clue] = placedPieces(lead);
      if (!clue) {
        throw new Error('No public clue');
      }
      w.interceptFrames(() => true);
      const oldIntent = input.controls.intent;
      input.controls.intent = () => IDLE;
      /** @param {Readonly<Vec3>} point */
      const walkPoint = async (point) => {
        const distance = () => Math.hypot(point[0] - session.body.pos[0], point[2] - session.body.pos[2]);
        const frames = Math.ceil((distance() / 2 + 3) * 60);
        input.controls.intent = () => ({ ...IDLE, forward: 1, walk: true });
        for (let n = 0; n < frames && distance() >= 0.04; n++) {
          engine.streamer.update(session.body.pos[0], session.body.pos[2]);
          openDoors();
          input.controls.yaw = Math.atan2(session.body.pos[0] - point[0], session.body.pos[2] - point[2]);
          input.controls.pitch = 0;
          session.frame(1 / 60);
          if (n % 120 === 0) {
            await new Promise(requestAnimationFrame);
          }
        }
        input.controls.intent = () => IDLE;
        if (distance() >= 0.04) {
          throw new Error('Could not walk beside the public-paper support');
        }
      };
      /** @param {Readonly<Vec3>} standing */
      const walkBeside = async (standing) => {
        if (!foot) {
          throw new Error('The reader has not left the roof');
        }
        const route = certificate.space.path(foot, standing);
        if (!route) {
          throw new Error('No route from roof exit to public paper');
        }
        for (const point of route) {
          await walkPoint(point);
        }
      };
      try {
        for (let n = 0; n < 60; n++) {
          session.frame(1 / 60);
        }
        input.controls.pitch = 0;
        foot = leaveRoof(session, certificate.space, start, {
          intent: (value) => {
            input.controls.intent = () => value;
          },
          yaw: (value) => {
            input.controls.yaw = value;
          },
          frame: () => session.frame(1 / 60),
          blockSize: engine.config.scale.blockSize,
        });
        await walkBeside(leadFace);
        const entity = [...engine.entities.all].find((value) => value.pos.every((v, axis) => v === clue.pos[axis]));
        if (!entity) {
          throw new Error('Public lead not streamed at start');
        }
        const at = furnitureSurfacePosition(entity);
        const pile = [...session.inventory.piles.values()].find((value) =>
          value.pos.every((v, axis) => v === at[axis]),
        );
        const paper = pile?.items.find(({ item }) => engine.registry.items.get(item.type)?.readable)?.item;
        if (!paper) {
          throw new Error('Public paper not on its support');
        }
        const pickup = session.queue.enqueue(paper, { kind: 'hand', side: 'right' });
        if (!pickup.ok) {
          throw new Error(pickup.reason);
        }
        const completed = session.queue.tick(session.queue.remaining);
        if (completed.failed.length > 0 || session.inventory.hands.right !== paper) {
          throw new Error('Ordinary public-paper pickup failed');
        }
        session.quickbar.assign(0, paper);
      } finally {
        input.controls.intent = oldIntent;
        w.interceptFrames((now, frame) => frame(now));
      }
    });
    // The first clue lies in the dark by design, so the reader brings a light found as loot.
    const lampUid = await page.evaluate(async () => {
      const { engine, session } = globalThis.skellyPlayTest;
      const lightsModule = '/@stage/@skelly/engine/internal/core/lights.ts';
      const { chargeOf } = await import(lightsModule);
      const { registry } = engine;
      /** @param {string} type */
      const roll = (type) => session.inventory.createRolled({ type, count: 1, condition: 1, charge: 1 });
      const lightType = [...registry.items.keys()].find((id) => {
        const light = registry.items.get(id)?.light;
        return light?.power && !light.burning && chargeOf(registry, roll(id)) > 0;
      });
      if (!lightType) {
        throw new Error('No content light charges for the reader');
      }
      const lamp = roll(lightType);
      const [x, y, z] = session.body.pos;
      /** @type {Vec3} */
      const feet = [Math.floor(x), Math.floor(y + 0.01), Math.floor(z)];
      if (!session.inventory.add(lamp, { kind: 'pile', pos: feet })) {
        throw new Error('No room for the light at the reader’s feet');
      }
      const take = session.queue.enqueue(lamp, { kind: 'hand', side: 'left' });
      if (!take.ok) {
        throw new Error(take.reason);
      }
      const taken = session.queue.tick(session.queue.remaining);
      if (taken.failed.length > 0 || session.inventory.hands.left !== lamp) {
        throw new Error('Ordinary light pickup failed');
      }
      return lamp.uid;
    });
    await page.waitForFunction(() => {
      const { session } = globalThis.skellyPlayTest;
      return !(session.queue.busy || session.firearms.busy);
    });
    await pressAction(page, 'hand.use-off');
    await page.waitForFunction(
      (uid) => globalThis.skellyPlayTest.session.inventory.itemByUid(uid)?.on === true,
      lampUid,
    );
    const releasePaper = await holdAction(page, 'quickbar.use.1');
    try {
      await page.locator('#reading').waitFor({ state: 'visible' });
    } finally {
      await releasePaper();
    }
    assert.ok((await page.locator('.reading-text').innerText()).trim().length > 0);
    const before = await page.evaluate(() => globalThis.skellyPlayTest.session.scenarioRun);
    assert(before, 'the gauntlet session has a scenario run');
    assert.notEqual(before.discovery.clueRead, null);
    await page.evaluate(() => globalThis.skellySaveTest.triggerPeriodicCheckpoint());
    await page.waitForFunction(() => {
      const save = globalThis.skellySaveTest.saveState();
      return save.savedGeneration > 0 && !save.writing && !save.queued;
    });
    await page.reload();
    await page.waitForFunction(() => globalThis.skellySaveTest?.saveState().ready);
    await page.click('#continue');
    await page.waitForFunction(() => globalThis.skellyPlayTest?.session.scenarioRun);
    assert.equal(await page.evaluate(() => globalThis.skellyPlayTest.session.won), false);
    assert.equal(
      await page.evaluate(() => globalThis.skellyPlayTest.session.scenarioRun?.discovery.clueRead),
      before.discovery.clueRead,
    );
    // Continue owns pointer-lock admission, just as a normal launch does.
    if (await page.locator('#go').isVisible()) {
      await page.click('#go');
    }
    await page.waitForFunction(
      () =>
        globalThis.skellyPlayTest?.worldLoading.ready &&
        globalThis.skellyPlayTest.input.locked &&
        !globalThis.skellyPlayTest.input.menuPointer &&
        !globalThis.skellyPlayTest.session.sim.paused,
    );
    const takenResourceTypes = await page.evaluate(async () => {
      const w = globalThis.skellyPlayTest;
      const { engine, session, input } = w;
      const { scenarioCertificate } = await import('/@stage/@skelly/engine/internal/core/scenarioCertificate.ts');
      const { doorPlan } = await import('/@stage/@skelly/engine/internal/core/options.ts');
      const { DOOR_ACTION } = await import('/@stage/@skelly/engine/internal/game/doorAction.ts');
      const { ladderOutward } = await import('/@stage/@skelly/engine/internal/core/ladders.ts');
      const { descentLid, queueDescentLidOpening } = await import('/test/fixtures/descentLid.ts');
      const { IDLE } = await import('/@stage/@skelly/engine/session');
      const { CitySite } = await import('/@stage/@skelly/engine/internal/core/citySite.ts');
      const { site } = engine;
      if (!(site instanceof CitySite)) {
        throw new Error('The gauntlet site is not a city site');
      }
      const { plan } = site;
      const { composition, portal, service } = plan;
      const fixedResource = composition?.resources[0];
      if (!(composition && fixedResource && portal && service)) {
        throw new Error('The gauntlet plan lacks its composition, fixed resource, portal or service block');
      }
      const certificate = scenarioCertificate(site);
      if (certificate.issues.length > 0) {
        throw new Error(JSON.stringify(certificate.issues));
      }
      const { space } = certificate;
      let intent = { ...IDLE };
      const originalIntent = input.controls.intent;
      input.controls.intent = () => intent;
      w.interceptFrames(() => true);
      const { routeDoorOpener } = await import('/test/browser/gauntlet-doors.mjs');
      const openDoors = routeDoorOpener(engine, session);
      const tick = () => {
        engine.streamer.update(session.body.pos[0], session.body.pos[2]);
        session.frame(1 / 60);
        // Manual ticks bypass the game loop, which rolls the replay window after each frame; the journey outlasts one.
        w.stepper.rollFullReplayWindow();
        if (session.sim.dead) {
          throw new Error(`Route stopped by survival: ${JSON.stringify(session.sim.dead)}`);
        }
      };
      /**
       * @param {() => unknown} predicate
       * @param {number} frames
       * @param {string} label
       */
      const until = async (predicate, frames, label) => {
        for (let n = 0; n < frames && !predicate(); n++) {
          tick();
          if (n % 120 === 0) {
            await new Promise(requestAnimationFrame);
          }
        }
        if (!predicate()) {
          throw new Error(
            `${label}: ${JSON.stringify({ pos: session.body.pos, hold: session.ladderHold.snapshotState() })}`,
          );
        }
      };
      /** @param {readonly Readonly<Vec3>[]} points */
      const walk = async (points) => {
        const simplified = points.filter((point, index) => {
          const a = points[index - 1];
          const b = points[index + 1];
          if (!(a && b)) {
            return true;
          }
          return (point[0] - a[0]) * (b[2] - point[2]) !== (point[2] - a[2]) * (b[0] - point[0]);
        });
        for (const target of simplified) {
          const distance = Math.hypot(target[0] - session.body.pos[0], target[2] - session.body.pos[2]);
          intent = { ...IDLE, forward: 1, walk: true };
          await until(
            () => {
              openDoors();
              const dx = target[0] - session.body.pos[0];
              const dz = target[2] - session.body.pos[2];
              input.controls.yaw = Math.atan2(-dx, -dz);
              input.controls.pitch = 0;
              const remaining = Math.hypot(dx, dz);
              const sprint = target[1] === plan.floor + 1 && remaining > 2;
              intent = { ...IDLE, forward: 1, sprint, walk: !sprint };
              return remaining < 0.04;
            },
            Math.ceil((distance / 2 + 3) * 60),
            'walk',
          );
          intent = { ...IDLE };
        }
      };
      /**
       * @param {Readonly<Vec3>} from
       * @param {Readonly<Vec3>} to
       */
      const route = (from, to) => {
        const points = space.path(from, to);
        if (!points) {
          throw new Error('No composed route');
        }
        return points;
      };
      const takeResource = async () => {
        await walk(route(corner, fixedResource.standing));
        const resource = engine.entities.at(...fixedResource.at);
        if (!(resource && session.inventory.canReachEntity(resource))) {
          throw new Error('Fixed resource inaccessible');
        }
        /** @type {Vec3} */
        const pilePos = [
          resource.pos[0] + Math.floor(resource.size[0] / 2),
          resource.pos[1] + resource.size[1],
          resource.pos[2] + Math.floor(resource.size[2] / 2),
        ];
        const resourceItems = session.inventory.pileAt(pilePos)?.items ?? [];
        const [first] = resourceItems;
        if (!first) {
          throw new Error('Fixed resource absent');
        }
        const resourceTypes = resourceItems.map(({ item: resourceItem }) => resourceItem.type);
        const { item } = first;
        const side = session.inventory.hands.right ? 'left' : 'right';
        const pickup = session.queue.enqueue(item, { kind: 'hand', side });
        if (!pickup.ok) {
          throw new Error(pickup.reason);
        }
        await until(
          () => session.inventory.hands[side]?.uid === item.uid,
          Math.ceil((pickup.job.duration + 5) * 60),
          'resource handling',
        );
        return resourceTypes;
      };
      const openHatch = async () => {
        await walk(route(fixedResource.standing, portal.upper));
        const hatch = [...engine.entities.all].find(
          (entity) => engine.entities.defOf(entity).door?.hatch && session.inventory.canReachEntity(entity),
        );
        if (!hatch) {
          throw new Error('Entrance hatch absent');
        }
        const opening = doorPlan(session.inventory, hatch, 'open');
        if (!opening.ok) {
          throw new Error(opening.reason);
        }
        session.queue.enqueueAction(DOOR_ACTION, 'Open hatch', opening.durationSimSeconds, { entityUid: hatch.uid });
        await until(() => hatch.open, Math.ceil((opening.durationSimSeconds + 1) * 60), 'hatch');
      };
      const connectionsFor = () => {
        /** @type {Connection[]} */
        const connections = [{ upper: portal.upper, lower: portal.lower }];
        const visited = new Set();
        let [, floor] = portal.lower;
        while (floor !== composition.objectiveFace[1]) {
          if (visited.has(floor)) {
            throw new Error('Cyclic descents');
          }
          visited.add(floor);
          const next = composition.descents.find((value) => value.upper[1] === floor);
          if (!next) {
            throw new Error('Missing descent');
          }
          connections.push(next);
          [, floor] = next.lower;
        }
        return connections;
      };
      /**
       * @param {HandSide} side
       * @param {Readonly<Vec3>} position
       */
      const freeHand = async (side, position) => {
        const held = session.inventory.hands[side];
        if (!held) {
          return;
        }
        const [x, y, z] = position;
        const drop = session.queue.enqueue(held, {
          kind: 'pile',
          pos: [Math.floor(x), Math.floor(y), Math.floor(z)],
        });
        if (!drop.ok) {
          throw new Error(drop.reason);
        }
        await until(() => !session.inventory.hands[side], Math.ceil((drop.job.duration + 1) * 60), 'free card hand');
      };
      /** @param {Seal} seal */
      const sealStock = async (seal) => {
        const holder = seal.held ? engine.entities.at(...seal.key) : undefined;
        if (!holder) {
          return session.inventory.pileAt(seal.key)?.items ?? [];
        }
        session.search(holder);
        await until(() => holder.searched, Math.ceil((session.queue.remaining + 1) * 60), 'keycard container search');
        return (holder.pockets ?? []).flat();
      };
      /** @param {Seal} seal */
      const takeCard = async (seal) => {
        const stock = await sealStock(seal);
        const card = stock.find(({ item }) => engine.registry.items.get(item.type)?.key)?.item;
        if (!card) {
          throw new Error('Placed seal keycard absent');
        }
        const side = session.inventory.hands.left ? 'right' : 'left';
        await freeHand(side, seal.standing);
        const pickup = session.queue.enqueue(card, { kind: 'hand', side });
        if (!pickup.ok) {
          throw new Error(pickup.reason);
        }
        await until(
          () => session.inventory.hands[side]?.uid === card.uid,
          Math.ceil((pickup.job.duration + 1) * 60),
          'keycard pickup',
        );
      };
      /** @param {Readonly<Vec3>} start */
      const takeCardsAt = async (start) => {
        let position = start;
        for (const seal of composition.seals.filter((candidate) => candidate.standing[1] === start[1])) {
          await walk(route(position, seal.standing));
          await takeCard(seal);
          position = seal.standing;
        }
        return position;
      };
      /**
       * @param {Readonly<Vec3>} position
       * @param {Connection} descent
       */
      const descend = async (position, descent) => {
        const from = await takeCardsAt(position);
        const bottomAt = descent.ladder;
        const bottom = bottomAt
          ? engine.entities.at(...bottomAt)
          : [...engine.entities.all].find(
              (entity) =>
                engine.entities.defOf(entity).climbable &&
                entity.pos[1] === descent.lower[1] &&
                Math.hypot(entity.pos[0] - descent.lower[0], entity.pos[2] - descent.lower[2]) <= 3,
            );
        if (!bottom) {
          throw new Error('Ladder absent');
        }
        const [ox, oz] = ladderOutward(bottom.facing);
        /** @type {Vec3} */
        const approach = [
          bottom.pos[0] + bottom.size[0] / 2 - ox,
          descent.upper[1],
          bottom.pos[2] + bottom.size[2] / 2 - oz,
        ];
        await walk(route(from, approach));
        const lid = descentLid(session, bottom, descent.upper[1]);
        const openingTime = queueDescentLidOpening(session, lid);
        await until(() => lid.open, Math.ceil((openingTime + 1) * 60), 'descent lid');
        const [top] = [...engine.entities.all]
          .filter(
            (entity) =>
              engine.entities.defOf(entity).climbable &&
              entity.pos[0] === bottom.pos[0] &&
              entity.pos[2] === bottom.pos[2] &&
              entity.pos[1] < descent.upper[1],
          )
          .sort((a, b) => b.pos[1] - a.pos[1]);
        const climbable = top && engine.entities.defOf(top).climbable;
        if (!(top && climbable)) {
          throw new Error('Ladder top absent');
        }
        const refusal = session.grabLadder(top);
        if (refusal) {
          throw new Error(refusal);
        }
        input.controls.yaw = Math.atan2(-ox, -oz);
        intent = { ...IDLE, forward: 1, walk: true };
        const travel =
          ((descent.upper[1] - descent.lower[1]) * engine.config.scale.blockSize) / climbable.speedMetresPerSimSecond;
        await until(
          () => session.body.onGround && session.body.pos[1] < descent.lower[1] + 0.1,
          Math.ceil((travel + 3) * 60),
          'descent',
        );
        intent = { ...IDLE };
        await walk(
          route(
            [bottom.pos[0] + bottom.size[0] / 2, descent.lower[1], bottom.pos[2] + bottom.size[2] / 2],
            descent.lower,
          ),
        );
        return descent.lower;
      };
      const aimGoal = () => {
        const goal = engine.entities.at(...composition.objective);
        if (!goal) {
          throw new Error('Goal absent');
        }
        const origin = w.eye();
        const dx = goal.pos[0] + goal.size[0] / 2 - origin[0];
        const dy = goal.pos[1] + goal.size[1] / 2 - origin[1];
        const dz = goal.pos[2] + goal.size[2] / 2 - origin[2];
        input.controls.yaw = Math.atan2(-dx, -dz);
        input.controls.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        const target = w.interactionTargetAt();
        if (!(target?.kind === 'furniture' && target.entity === goal)) {
          throw new Error('Goal not visible');
        }
      };
      /** @type {Vec3} */
      const corner = [
        service.origin[0] - plan.grid.pad - plan.grid.street / 2,
        plan.floor + 1,
        service.origin[2] - plan.grid.pad - plan.grid.street / 2,
      ];
      try {
        await until(() => session.body.onGround, 120, 'start support');
        await walk(route([session.body.pos[0], plan.floor + 1, session.body.pos[2]], corner));
        const resourceTypes = await takeResource();
        await openHatch();
        let position = portal.upper;
        for (const descent of connectionsFor()) {
          position = await descend(position, descent);
        }
        await walk(route(position, composition.objectiveFace));
        aimGoal();
        return resourceTypes;
      } finally {
        input.controls.intent = originalIntent;
        w.interceptFrames((now, frame) => frame(now));
      }
    });
    const locksBeforeWin = await saveLockSnapshot(page);
    await pressAction(page, 'world.interact');
    await page.waitForFunction(() => globalThis.skellyPlayTest.session.won);
    const wonRun = await page.evaluate(() => globalThis.skellyPlayTest.session.scenarioRun);
    assert.ok(takenResourceTypes.length > 0);
    assert(wonRun, 'the won gauntlet session has a scenario run');
    assert.notEqual(wonRun.discovery.entranceTravel, null);
    await page.locator('#death').waitFor({ state: 'visible' });
    try {
      await page.waitForFunction(() => globalThis.skellySaveTest.controller.winCheckpointStatus === 'saved');
    } catch (error) {
      // #749: a bare timeout hides whether the win capture is queued behind a stalled write.
      const state = await page
        .evaluate(() => {
          const { controller, saveState } = globalThis.skellySaveTest;
          const save = saveState();
          return {
            status: controller.winCheckpointStatus,
            writing: save.writing,
            queued: save.queued?.reason ?? null,
            failure: save.failure,
            ids: [save.worldId, save.characterId],
            run: globalThis.skellyPlayTest.session.scenarioRun,
          };
        })
        .catch((stateError) => `unreadable: ${stateError.message}`);
      const locks = { beforeWin: locksBeforeWin, afterTimeout: await saveLockSnapshot(page) };
      throw new Error(
        `win checkpoint wait timed out; save controller state: ${JSON.stringify(state)}; save locks: ${JSON.stringify(locks)}`,
        { cause: error },
      );
    }
    await page.reload();
    await page.waitForFunction(() => globalThis.skellySaveTest?.saveState().ready);
    await page.click('#continue');
    await page.locator('#death').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => globalThis.skellyPlayTest.session.won), true);
    assert.deepEqual(await page.evaluate(() => globalThis.skellyPlayTest.session.scenarioRun), wonRun);
    // A separate fresh attempt exercises the ordinary dead-survivor barrier, not a won-to-dead mutation.
    const deadContext = await browser.newContext();
    await deadContext.addInitScript(useRouteFixture);
    try {
      const deadPage = await deadContext.newPage();
      await deadPage.goto(url.href);
      await deadPage.waitForFunction(() => globalThis.skellySaveTest?.saveState().ready);
      await deadPage.click('#go');
      await deadPage.waitForFunction(
        () =>
          globalThis.skellyPlayTest?.worldLoading.ready &&
          globalThis.skellyPlayTest.input.locked &&
          !globalThis.skellyPlayTest.session.sim.paused,
      );
      await deadPage.evaluate(() =>
        globalThis.skellyPlayTest.session.sim.hurt(9999, 'gauntlet death boundary fixture'),
      );
      await deadPage.locator('#death').waitFor({ state: 'visible' });
      await deadPage.waitForFunction(() => {
        const { writing, queued } = globalThis.skellySaveTest.saveState();
        return !(writing || queued);
      });
      await deadPage.reload();
      await deadPage.waitForFunction(() => globalThis.skellySaveTest?.saveState().ready);
      assert.equal(await deadPage.locator('#continue').isEnabled(), false);
    } finally {
      await deadContext.close();
    }
  } finally {
    await context.close();
  }
};
