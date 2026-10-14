// biome-ignore-all lint/correctness/noNodejsModules: browser-flow contract uses Node assertions.
// biome-ignore-all lint/correctness/noUnresolvedImports: page imports resolve through Vite.
// biome-ignore-all lint/suspicious/noMisplacedAssertion: standalone browser contract.
// biome-ignore-all lint/performance/noAwaitInLoops: route segments and save boundaries run in order.
import assert from 'node:assert/strict';
import { pressAction } from './input-actions.mjs';

export const gauntletFlow = async (browser, baseUrl) => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  try {
    const page = await context.newPage();
    const url = new URL(baseUrl);
    url.searchParams.set('site', 'gauntlet');
    url.searchParams.set('route-fixture', '1');
    url.searchParams.delete('actors');
    await page.goto(url.href);
    await page.waitForFunction(() => globalThis.deadvoxSaveTest?.controller.ready);
    await page.click('#go');
    await page.waitForFunction(
      () => globalThis.gauntletWitness?.input.locked && !globalThis.gauntletWitness.session.sim.paused,
    );
    await page.evaluate(async () => {
      const w = globalThis.gauntletWitness;
      const { engine, session, input } = w;
      const { placedPieces } = await import('/src/core/templates.ts');
      const { IDLE } = await import('/src/game/session.ts');
      const clue = placedPieces(engine.site.plan.composition.leads[0]).find(
        (piece) => engine.registry.furniture.get(piece.furniture)?.readable,
      );
      if (!clue) {
        throw new Error('No public clue');
      }
      w.manual = true;
      const oldIntent = input.intent;
      input.intent = () => IDLE;
      try {
        for (let n = 0; n < 60; n++) {
          session.frame(1 / 60);
        }
        const entity = [...engine.entities.all].find((value) => value.pos.every((v, axis) => v === clue.pos[axis]));
        if (!entity) {
          throw new Error('Public lead not streamed at start');
        }
        const at = entity.pos.map((v, axis) => v + entity.size[axis] / 2);
        const origin = w.eye();
        const [dx, dy, dz] = at.map((v, axis) => v - origin[axis]);
        input.yaw = Math.atan2(-dx, -dz);
        input.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        if (w.lookedAt() !== entity) {
          throw new Error('Public lead not visible from ordinary start');
        }
      } finally {
        input.intent = oldIntent;
        w.manual = false;
      }
    });
    await pressAction(page, 'world.interact');
    await page.locator('#reading').waitFor({ state: 'visible' });
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
      () => globalThis.gauntletWitness.input.locked && !globalThis.gauntletWitness.session.sim.paused,
    );
    const journey = await page.evaluate(async () => {
      const w = globalThis.gauntletWitness;
      const { engine, session, input } = w;
      const { scenarioCertificate } = await import('/src/core/scenarioCertificate.ts');
      const { doorPlan } = await import('/src/core/options.ts');
      const { DOOR_ACTION } = await import('/src/game/doorAction.ts');
      const { ladderOutward } = await import('/src/core/ladders.ts');
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
      const queued = new Set();
      const tick = () => {
        engine.streamer.update(session.body.pos[0], session.body.pos[2]);
        session.frame(1 / 60);
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
      const openDoors = () => {
        for (const entity of engine.entities.all) {
          const { door } = engine.entities.defOf(entity);
          if (
            !door ||
            door.hatch ||
            entity.open ||
            entity.lock?.locked ||
            queued.has(entity.uid) ||
            !session.inventory.canReachEntity(entity)
          ) {
            continue;
          }
          const opening = doorPlan(session.inventory, entity, 'open');
          if (opening.ok) {
            queued.add(entity.uid);
            session.queue.enqueueAction(DOOR_ACTION, 'Open route door', opening.time, { entityUid: entity.uid });
          }
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
              const sprint = target[1] === plan.spawn[1] && remaining > 2;
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
      const descend = async (position, descent) => {
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
        await walk(route(position, approach));
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
        plan.spawn[1],
        plan.service.origin[2] - plan.grid.pad - plan.grid.street / 2,
      ];
      try {
        await until(() => session.body.onGround, 120, 'start support');
        await walk([[...plan.spawn], [corner[0], corner[1], plan.spawn[2]], corner]);
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
    await pressAction(page, 'world.interact');
    await page.waitForFunction(() => globalThis.gauntletWitness.session.won);
    journey.run = await page.evaluate(() => globalThis.gauntletWitness.session.scenarioRun);
    assert.ok(journey.resourceTypes.length > 0);
    assert.notEqual(journey.run.discovery.entranceTravel, null);
    await page.locator('#death').waitFor({ state: 'visible' });
    await page.waitForFunction(() => globalThis.deadvoxSaveTest.controller.winCheckpointStatus === 'saved');
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
        () => globalThis.gauntletWitness?.session && !globalThis.gauntletWitness.session.sim.paused,
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
