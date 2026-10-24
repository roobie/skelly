// biome-ignore-all lint/correctness/noNodejsModules: browser-flow contract uses Node assertions.
// biome-ignore-all lint/correctness/noUnresolvedImports: page imports resolve through Vite.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone browser contract.
// biome-ignore-all lint/performance/noAwaitInLoops: route segments and save boundaries run in order.
import assert from 'node:assert/strict';
import { holdAction, pressAction } from './input-actions.mjs';
import { installSaveStatusTrace, saveLockSnapshot } from './save-lock-diagnostics.mjs';
import { installWorldMeshControl } from './world-mesh-fixture.mjs';

const gauntletLoading = async (browser, baseUrl) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  try {
    await context.addInitScript(installWorldMeshControl);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const url = new URL(baseUrl);
    url.searchParams.set('site', 'gauntlet');
    url.searchParams.set('debug', '1');
    url.searchParams.set('time', '12:00');
    url.searchParams.delete('actors');
    await page.goto(url.href);
    await page.waitForFunction(() => document.querySelector('#go')?.getAttribute('aria-disabled') === 'false');
    await page.evaluate(() => {
      globalThis.holdWorldMeshes = true;
    });
    await page.click('#go');
    await page.waitForFunction(() => globalThis.worldLoadWitness && document.pointerLockElement !== null);
    assert.equal(await page.locator('#world-loading').isVisible(), true, 'gauntlet creation is masked');
    const masked = await page.evaluate(() => {
      const { session, worldLoading, engine, frame } = globalThis.worldLoadWitness;
      const before = {
        time: session.sim.time,
        position: [...session.body.pos],
        elapsed: session.scenarioRun.activeRealSeconds,
      };
      const now = performance.now();
      for (let step = 1; step <= 3; step++) {
        frame(now + step * 100);
      }
      return {
        ready: worldLoading.ready,
        paused: session.sim.paused,
        pending: engine.streamer.unmeshedColumns(session.body.pos[0], session.body.pos[2], engine.config.radiusChunks),
        before,
        after: {
          time: session.sim.time,
          position: [...session.body.pos],
          elapsed: session.scenarioRun.activeRealSeconds,
        },
      };
    });
    assert.equal(masked.ready, false);
    assert.equal(masked.paused, true);
    assert(masked.pending > 0, 'gauntlet has actual outstanding mesh work');
    assert.deepEqual(masked.after, masked.before, 'simulation, position and scenario elapsed time remain frozen');
    await page.evaluate(() => globalThis.releaseWorldMeshes());
    await page.waitForFunction(() => globalThis.worldLoadWitness.worldLoading.ready);
    assert.equal(await page.locator('#world-loading').isVisible(), false, 'gauntlet readiness reveals the scene');
    const advancing = await page.evaluate(() => {
      const { session, frame } = globalThis.worldLoadWitness;
      const { time } = session.sim;
      const elapsed = session.scenarioRun.activeRealSeconds;
      frame(performance.now() + 100);
      return session.sim.time > time && session.scenarioRun.activeRealSeconds > elapsed;
    });
    assert.equal(advancing, true, 'gauntlet simulation and run clock resume after readiness');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
};

export const gauntletFlow = async (browser, baseUrl) => {
  await gauntletLoading(browser, baseUrl);
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  try {
    await context.addInitScript(installSaveStatusTrace);
    const page = await context.newPage();
    const url = new URL(baseUrl);
    url.searchParams.set('site', 'gauntlet');
    url.searchParams.set('route-fixture', '1');
    url.searchParams.set('debug', '1');
    url.searchParams.delete('actors');
    await page.goto(url.href);
    await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready);
    await page.click('#go');
    await page.waitForFunction(
      () =>
        globalThis.worldLoadWitness?.worldLoading.ready &&
        globalThis.gauntletWitness.input.locked &&
        !globalThis.gauntletWitness.input.menuPointer &&
        !globalThis.gauntletWitness.session.sim.paused,
    );
    await page.evaluate(() => {
      const w = globalThis.gauntletWitness;
      const { engine } = w;
      const overlay = document.querySelector('#debug-kit-overlay');
      if (!overlay) {
        throw new Error('Debug kit overlay missing');
      }
      overlay.querySelector('button').click();
      const placements = engine.site.authoredPlacements.filter((item) => item.template.ownership);
      const selected = placements.findIndex((item) => item.template.reserved.includes(1));
      if (selected < 0) {
        throw new Error('No compiled reserved void to inspect');
      }
      const placementInput = overlay.querySelector('[aria-label="Kit placement"]');
      placementInput.value = String(selected);
      placementInput.dispatchEvent(new Event('change'));
      const { template } = placements[selected];
      const index = template.reserved.indexOf(1);
      const x = index % template.size[0];
      const z = Math.floor(index / template.size[0]) % template.size[2];
      const y = Math.floor(index / (template.size[0] * template.size[2]));
      const layer = overlay.querySelector('[aria-label="Kit layer"]');
      layer.value = String(y);
      layer.dispatchEvent(new Event('change'));
      const canvas = overlay.querySelector('canvas');
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(
        new PointerEvent('pointermove', {
          clientX: rect.left + ((x + 0.5) * rect.width) / template.size[0],
          clientY: rect.top + ((z + 0.5) * rect.height) / template.size[2],
        }),
      );
      const detail = overlay.querySelector('pre').textContent;
      const record = template.provenance[index];
      if (!record) {
        throw new Error('Reserved cell lacks compiler provenance');
      }
      for (const field of ['owner', 'source', 'variant']) {
        if (!detail.includes(`${field} ${record[field]}`)) {
          throw new Error(`Overlay differs from compiler ${field}`);
        }
      }
      if (!detail.includes('reserved void yes')) {
        throw new Error('Overlay lost reserved void');
      }
      overlay.querySelector('button').click();
    });
    await page.evaluate(async () => {
      const w = globalThis.gauntletWitness;
      const { engine, session, input } = w;
      const { placedPieces } = await import('/src/core/templates.ts');
      const { furnitureSurfacePosition } = await import('/src/core/furnitureSurface.ts');
      const { scenarioCertificate } = await import('/src/core/scenarioCertificate.ts');
      const { routeDoorOpener } = await import('/test/browser/gauntlet-doors.mjs');
      const openDoors = routeDoorOpener(engine, session);
      const { leaveRoof } = await import('/test/fixtures/scenarioStart.ts');
      const certificate = scenarioCertificate(engine.site);
      let foot;
      const { IDLE } = await import('/src/game/session.ts');
      const [clue] = placedPieces(engine.site.plan.composition.leads[0]);
      if (!clue) {
        throw new Error('No public clue');
      }
      w.manual = true;
      const oldIntent = input.intent;
      input.intent = () => IDLE;
      const walkPoint = async (point) => {
        const distance = () => Math.hypot(point[0] - session.body.pos[0], point[2] - session.body.pos[2]);
        const frames = Math.ceil((distance() / 2 + 3) * 60);
        input.intent = () => ({ ...IDLE, forward: 1, walk: true });
        for (let n = 0; n < frames && distance() >= 0.04; n++) {
          engine.streamer.update(session.body.pos[0], session.body.pos[2]);
          openDoors();
          input.yaw = Math.atan2(session.body.pos[0] - point[0], session.body.pos[2] - point[2]);
          input.pitch = 0;
          session.frame(1 / 60);
          if (n % 120 === 0) {
            await new Promise(requestAnimationFrame);
          }
        }
        input.intent = () => IDLE;
        if (distance() >= 0.04) {
          throw new Error('Could not walk beside the public-paper support');
        }
      };
      const walkBeside = async (standing) => {
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
        input.pitch = 0;
        foot = leaveRoof(session, certificate.space, engine.site.plan.composition.start, {
          intent: (value) => {
            input.intent = () => value;
          },
          yaw: (value) => {
            input.yaw = value;
          },
          frame: () => session.frame(1 / 60),
          blockSize: engine.config.scale.blockSize,
        });
        await walkBeside(engine.site.plan.composition.leadFaces[0]);
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
        input.intent = oldIntent;
        w.manual = false;
      }
    });
    const releasePaper = await holdAction(page, 'quickbar.use.1');
    try {
      await page.locator('#reading').waitFor({ state: 'visible' });
    } finally {
      await releasePaper();
    }
    assert.ok((await page.locator('.reading-text').innerText()).trim().length > 0);
    const before = await page.evaluate(() => globalThis.gauntletWitness.session.scenarioRun);
    assert.notEqual(before.discovery.clueRead, null);
    await page.evaluate(() => globalThis.deadvoxSaveTest.triggerPeriodicCheckpoint());
    await page.waitForFunction(() => {
      const c = globalThis.deadvoxSaveTest.controller;
      return c.savedGeneration > 0 && !c.writing && !c.queued;
    });
    await page.reload();
    await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready);
    await page.click('#continue');
    await page.waitForFunction(() => globalThis.gauntletWitness?.session.scenarioRun);
    assert.equal(await page.evaluate(() => globalThis.gauntletWitness.session.won), false);
    assert.equal(
      await page.evaluate(() => globalThis.gauntletWitness.session.scenarioRun.discovery.clueRead),
      before.discovery.clueRead,
    );
    // Continue owns pointer-lock admission, just as a normal launch does.
    if (await page.locator('#go').isVisible()) {
      await page.click('#go');
    }
    await page.waitForFunction(
      () =>
        globalThis.worldLoadWitness?.worldLoading.ready &&
        globalThis.gauntletWitness.input.locked &&
        !globalThis.gauntletWitness.input.menuPointer &&
        !globalThis.gauntletWitness.session.sim.paused,
    );
    const journey = await page.evaluate(async () => {
      const w = globalThis.gauntletWitness;
      const { engine, session, input } = w;
      const { scenarioCertificate } = await import('/src/core/scenarioCertificate.ts');
      const { doorPlan } = await import('/src/core/options.ts');
      const { DOOR_ACTION } = await import('/src/game/doorAction.ts');
      const { ladderOutward } = await import('/src/core/ladders.ts');
      const { descentLid, queueDescentLidOpening } = await import('/test/fixtures/descentLid.ts');
      const { IDLE } = await import('/src/game/session.ts');
      const { plan } = engine.site;
      const certificate = scenarioCertificate(engine.site);
      if (certificate.issues.length > 0) {
        throw new Error(JSON.stringify(certificate.issues));
      }
      const { space } = certificate;
      let intent = { ...IDLE };
      const originalIntent = input.intent;
      input.intent = () => intent;
      w.manual = true;
      const { routeDoorOpener } = await import('/test/browser/gauntlet-doors.mjs');
      const openDoors = routeDoorOpener(engine, session);
      const tick = () => {
        engine.streamer.update(session.body.pos[0], session.body.pos[2]);
        session.frame(1 / 60);
        // Manual ticks bypass the game loop, which rolls the replay window after each frame; the journey outlasts one.
        w.rollReplay();
        if (session.sim.dead) {
          throw new Error(`Route stopped by survival: ${JSON.stringify(session.sim.dead)}`);
        }
      };
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
      const walk = async (points) => {
        const simplified = points.filter((point, index) => {
          if (index === 0 || index === points.length - 1) {
            return true;
          }
          const a = points[index - 1];
          const b = points[index + 1];
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
              input.yaw = Math.atan2(-dx, -dz);
              input.pitch = 0;
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
      const route = (from, to) => {
        const points = space.path(from, to);
        if (!points) {
          throw new Error('No composed route');
        }
        return points;
      };
      const takeResource = async () => {
        await walk(route(corner, plan.composition.resources[0].standing));
        const resource = engine.entities.at(...plan.composition.resources[0].at);
        if (!(resource && session.inventory.canReachEntity(resource))) {
          throw new Error('Fixed resource inaccessible');
        }
        const pilePos = [
          resource.pos[0] + Math.floor(resource.size[0] / 2),
          resource.pos[1] + resource.size[1],
          resource.pos[2] + Math.floor(resource.size[2] / 2),
        ];
        const resourceItems = session.inventory.pileAt(pilePos)?.items ?? [];
        if (resourceItems.length === 0) {
          throw new Error('Fixed resource absent');
        }
        const resourceTypes = resourceItems.map(({ item: resourceItem }) => resourceItem.type);
        const { item } = resourceItems[0];
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
        await walk(route(plan.composition.resources[0].standing, plan.portal.upper));
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
        session.queue.enqueueAction(DOOR_ACTION, 'Open hatch', opening.time, { entityUid: hatch.uid });
        await until(() => hatch.open, Math.ceil((opening.time + 1) * 60), 'hatch');
      };
      const connectionsFor = () => {
        const connections = [{ upper: plan.portal.upper, lower: plan.portal.lower }];
        const visited = new Set();
        let [, floor] = plan.portal.lower;
        while (floor !== plan.composition.objectiveFace[1]) {
          if (visited.has(floor)) {
            throw new Error('Cyclic descents');
          }
          visited.add(floor);
          const next = plan.composition.descents.find((value) => value.upper[1] === floor);
          if (!next) {
            throw new Error('Missing descent');
          }
          connections.push(next);
          [, floor] = next.lower;
        }
        return connections;
      };
      const freeHand = async (side, position) => {
        const held = session.inventory.hands[side];
        if (!held) {
          return;
        }
        const drop = session.queue.enqueue(held, { kind: 'pile', pos: position.map(Math.floor) });
        if (!drop.ok) {
          throw new Error(drop.reason);
        }
        await until(() => !session.inventory.hands[side], Math.ceil((drop.job.duration + 1) * 60), 'free card hand');
      };
      const sealStock = async (seal) => {
        const holder = seal.held ? engine.entities.at(...seal.key) : undefined;
        if (!holder) {
          return session.inventory.pileAt(seal.key)?.items ?? [];
        }
        session.search(holder);
        await until(() => holder.searched, Math.ceil((session.queue.remaining + 1) * 60), 'keycard container search');
        return (holder.pockets ?? []).flat();
      };
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
      const takeCardsAt = async (start) => {
        let position = start;
        for (const seal of plan.composition.seals.filter((candidate) => candidate.standing[1] === start[1])) {
          await walk(route(position, seal.standing));
          await takeCard(seal);
          position = seal.standing;
        }
        return position;
      };
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
        const refusal = session.grabLadder(top);
        if (refusal) {
          throw new Error(refusal);
        }
        input.yaw = Math.atan2(-ox, -oz);
        intent = { ...IDLE, forward: 1, walk: true };
        const travel =
          ((descent.upper[1] - descent.lower[1]) * engine.config.scale.blockSize) /
          engine.entities.defOf(top).climbable.speedMetresPerSimSecond;
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
        const goal = engine.entities.at(...plan.composition.objective);
        const at = goal.pos.map((v, axis) => v + goal.size[axis] / 2);
        const origin = w.eye();
        const [dx, dy, dz] = at.map((v, axis) => v - origin[axis]);
        input.yaw = Math.atan2(-dx, -dz);
        input.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        if (w.lookedAt() !== goal) {
          throw new Error('Goal not visible');
        }
      };
      const corner = [
        plan.service.origin[0] - plan.grid.pad - plan.grid.street / 2,
        plan.floor + 1,
        plan.service.origin[2] - plan.grid.pad - plan.grid.street / 2,
      ];
      try {
        await until(() => session.body.onGround, 120, 'start support');
        await walk(route([session.body.pos[0], plan.floor + 1, session.body.pos[2]], corner));
        const resourceTypes = await takeResource();
        await openHatch();
        let position = plan.portal.upper;
        for (const descent of connectionsFor()) {
          position = await descend(position, descent);
        }
        await walk(route(position, plan.composition.objectiveFace));
        aimGoal();
        return { resourceTypes, run: session.scenarioRun };
      } finally {
        input.intent = originalIntent;
        w.manual = false;
      }
    });
    const locksBeforeWin = await saveLockSnapshot(page);
    await pressAction(page, 'world.interact');
    await page.waitForFunction(() => globalThis.gauntletWitness.session.won);
    journey.run = await page.evaluate(() => globalThis.gauntletWitness.session.scenarioRun);
    assert.ok(journey.resourceTypes.length > 0);
    assert.notEqual(journey.run.discovery.entranceTravel, null);
    await page.locator('#death').waitFor({ state: 'visible' });
    try {
      await page.waitForFunction(() => globalThis.deadvoxSaveTest.controller.winCheckpointStatus === 'saved');
    } catch (error) {
      // #749: a bare timeout hides whether the win capture is queued behind a stalled write.
      const state = await page
        .evaluate(() => {
          const c = globalThis.deadvoxSaveTest.controller;
          return {
            status: c.winCheckpointStatus,
            writing: c.writing,
            queued: c.queued?.reason ?? null,
            failure: c.failure ?? null,
            ids: [c.worldId, c.characterId],
            run: globalThis.gauntletWitness.session.scenarioRun,
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
    await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready);
    await page.click('#continue');
    await page.locator('#death').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => globalThis.gauntletWitness.session.won), true);
    assert.deepEqual(await page.evaluate(() => globalThis.gauntletWitness.session.scenarioRun), journey.run);
    // A separate fresh attempt exercises the ordinary dead-survivor barrier, not a won-to-dead mutation.
    const deadContext = await browser.newContext();
    try {
      const deadPage = await deadContext.newPage();
      await deadPage.goto(url.href);
      await deadPage.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready);
      await deadPage.click('#go');
      await deadPage.waitForFunction(
        () =>
          globalThis.worldLoadWitness?.worldLoading.ready &&
          globalThis.gauntletWitness.input.locked &&
          !globalThis.gauntletWitness.session.sim.paused,
      );
      await deadPage.evaluate(() =>
        globalThis.gauntletWitness.session.sim.hurt(9999, 'gauntlet death boundary fixture'),
      );
      await deadPage.locator('#death').waitFor({ state: 'visible' });
      await deadPage.waitForFunction(
        () => !(globalThis.deadvoxSaveTest.controller.writing || globalThis.deadvoxSaveTest.controller.queued),
      );
      await deadPage.reload();
      await deadPage.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready);
      assert.equal(await deadPage.locator('#continue').isEnabled(), false);
    } finally {
      await deadContext.close();
    }
  } finally {
    await context.close();
  }
};
