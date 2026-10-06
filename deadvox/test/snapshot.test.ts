import { describe, expect, it } from 'vitest';
import { Character, practiceForNextLevel, SKILL_LEVEL_LEGENDARY } from '../src/core/character.ts';
import { Chunk } from '../src/core/chunk.ts';
import { CHUNK } from '../src/core/coords.ts';
import { disassemblyOutputs, SALVAGE_DURATION } from '../src/core/disassembly.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import { Simulation } from '../src/core/sim.ts';
import type { Site } from '../src/core/site.ts';
import { World } from '../src/core/world.ts';
import { QuickbarActions } from '../src/game/quickbarActions.ts';
import {
  blockId,
  blockName,
  capture,
  contentLookup,
  createRuntime,
  encodeFixture,
  formatVersion,
  registry,
  startRest,
} from './snapshotTestSupport.ts';

describe('snapshot state components', () => {
  it('keeps a crouch toggle through an inactive long action and deterministic save continuation', () => {
    const uninterrupted = createRuntime(undefined, true);
    expect(startRest(uninterrupted, 'rest')).toBeUndefined();
    uninterrupted.toggleCrouch();
    uninterrupted.session.frame(1 / 60);
    expect(uninterrupted.session.crouching).toBe(true);

    const restored = createRuntime(capture(uninterrupted), true);
    expect(restored.session.crouching).toBe(true);
    for (let frame = 0; frame < 30; frame++) {
      uninterrupted.session.frame(1 / 60);
      restored.session.frame(1 / 60);
      expect(restored.session.crouching).toBe(uninterrupted.session.crouching);
    }
    uninterrupted.toggleCrouch();
    restored.toggleCrouch();
    uninterrupted.session.frame(1 / 60);
    restored.session.frame(1 / 60);
    expect(uninterrupted.session.crouching).toBe(false);
    expect(restored.session.crouching).toBe(false);
    expect(capture(restored).character.player.crouching).toBe(false);
  });
  it('persists zero-start skills and changed recipe knowledge without reseeding or mutating live state', async () => {
    const runtime = createRuntime();
    const actor = runtime.session.character;
    expect(Object.keys(actor.skills).sort()).toEqual([...registry.skills.keys()].sort());
    expect(Object.values(actor.skills).every((level) => level === 0)).toBe(true);
    const removedRecipe = actor.knownRecipes.values().next().value;
    if (removedRecipe === undefined) {
      throw new Error('starter character has no known recipe');
    }
    const firstThreshold = practiceForNextLevel(actor.skills.crafting!);
    const award = firstThreshold + practiceForNextLevel(actor.skills.crafting! + 1) / 2;
    actor.awardPractice('crafting', award, SKILL_LEVEL_LEGENDARY);
    const savedLevel = actor.skills.crafting!;
    const savedPractice = actor.practice.crafting;
    actor.knownRecipes.delete(removedRecipe);
    const snapshot = capture(runtime);
    actor.awardPractice('crafting', practiceForNextLevel(savedLevel), SKILL_LEVEL_LEGENDARY);
    const decoded = await decodeSave(await encodeFixture(snapshot), { version: formatVersion, contentLookup });
    const loadedRuntime = createRuntime(decoded.snapshot);
    const loaded = loadedRuntime.session.character;
    expect(loaded.skills.crafting).toBe(savedLevel);
    expect(loaded.practice.crafting).toBe(savedPractice);
    expect(loaded.knownRecipes).toEqual(new Set(actor.knownRecipes));
    expect(loaded.knownRecipes.has(removedRecipe)).toBe(false);
    expect(actor.skills.crafting).toBe(savedLevel + 1);
  });

  it('advances a skill only when its accumulated practice reaches the next-level threshold', () => {
    const actor = new Character(registry);
    const threshold = practiceForNextLevel(actor.skills.crafting!);
    actor.awardPractice('crafting', threshold / 2, SKILL_LEVEL_LEGENDARY);
    expect(actor.skills.crafting).toBe(0);
    expect(actor.practice.crafting).toBe(threshold / 2);
    actor.awardPractice('crafting', threshold / 2, SKILL_LEVEL_LEGENDARY);
    expect(actor.skills.crafting).toBe(1);
    expect(actor.practice.crafting).toBe(0);
  });

  it('round-trips a stopped reading action with its held book uid and progress', async () => {
    const runtime = createRuntime();
    const feet = runtime.player.body.pos.map(Math.floor) as import('../src/core/coords.ts').Vec3;
    for (const item of [runtime.inventory.hands.right, runtime.inventory.hands.left]) {
      if (item) {
        expect(runtime.inventory.move(item, { kind: 'pile', pos: feet }).ok).toBe(true);
      }
    }
    const book = runtime.inventory.create('field_manual');
    expect(runtime.inventory.add(book, { kind: 'hand', side: 'right' })).toBe(true);
    expect(runtime.sim.actions.beginReading(book.uid)).toBeUndefined();
    runtime.sim.scheduler.advance(2 / runtime.sim.clock.ratio + 2);
    runtime.sim.actions.stop();
    const snapshot = capture(runtime);
    expect(snapshot.character.longAction.job).toMatchObject({ jobType: 'reading', stopped: true, bookUid: book.uid });

    const decoded = await decodeSave(await encodeFixture(snapshot), { version: formatVersion, contentLookup });
    const loaded = createRuntime(decoded.snapshot);
    expect(loaded.sim.actions.job).toMatchObject({
      jobType: 'reading',
      stopped: true,
      bookUid: book.uid,
      elapsed: (snapshot.character.longAction.job as { elapsed: number }).elapsed,
    });
    expect(loaded.inventory.itemByUid(book.uid)?.type).toBe('field_manual');
  });

  it('saves stopped reading with the book in a pile and resumes only after it is held', async () => {
    const runtime = createRuntime();
    const initialFeet = runtime.player.body.pos.map(Math.floor) as import('../src/core/coords.ts').Vec3;
    const otherPile: import('../src/core/coords.ts').Vec3 = [initialFeet[0] + 1, initialFeet[1], initialFeet[2]];
    for (const item of [runtime.inventory.hands.right, runtime.inventory.hands.left]) {
      if (item) {
        expect(runtime.inventory.move(item, { kind: 'pile', pos: otherPile }).ok).toBe(true);
      }
    }
    const book = runtime.inventory.create('field_manual');
    expect(runtime.inventory.add(book, { kind: 'hand', side: 'right' })).toBe(true);
    expect(runtime.sim.actions.beginReading(book.uid)).toBeUndefined();
    runtime.sim.scheduler.advance(2 / runtime.sim.clock.ratio + 2);
    runtime.sim.actions.stop();
    const elapsed = runtime.sim.actions.job?.jobType === 'reading' ? runtime.sim.actions.job.elapsed : 0;
    const feet = runtime.player.body.pos.map(Math.floor) as import('../src/core/coords.ts').Vec3;
    expect(runtime.inventory.move(book, { kind: 'pile', pos: feet }).ok).toBe(true);
    // The test player starts in freefall; keep the pile reachable after the tick.
    runtime.world.setBlock(feet[0], feet[1] - 1, feet[2], blockId('grass'));
    runtime.sim.scheduler.advance(1);

    const snapshot = capture(runtime);
    expect(snapshot.character.longAction.job).toMatchObject({
      jobType: 'reading',
      stopped: true,
      bookUid: book.uid,
      elapsed,
    });
    const decoded = await decodeSave(await encodeFixture(snapshot), { version: formatVersion, contentLookup });
    const loaded = createRuntime(decoded.snapshot);
    expect(loaded.sim.actions.job).toMatchObject({ jobType: 'reading', stopped: true, bookUid: book.uid, elapsed });
    expect(loaded.sim.actions.resume()).toBe('Keep the book in your hands');
    const loadedBook = loaded.inventory.itemByUid(book.uid)!;
    expect(loaded.inventory.move(loadedBook, { kind: 'hand', side: 'right' }).ok).toBe(true);
    expect(loaded.sim.actions.resume()).toBeUndefined();
  });

  it('omits a stale stopped reading from the save without ending the live job before its next tick', async () => {
    const runtime = createRuntime();
    const feet = runtime.player.body.pos.map(Math.floor) as import('../src/core/coords.ts').Vec3;
    const otherPile: import('../src/core/coords.ts').Vec3 = [feet[0] + 1, feet[1], feet[2]];
    for (const item of [runtime.inventory.hands.right, runtime.inventory.hands.left]) {
      if (item) {
        expect(runtime.inventory.move(item, { kind: 'pile', pos: otherPile }).ok).toBe(true);
      }
    }
    const book = runtime.inventory.create('field_manual');
    expect(runtime.inventory.add(book, { kind: 'hand', side: 'right' })).toBe(true);
    expect(runtime.sim.actions.beginReading(book.uid)).toBeUndefined();
    runtime.sim.scheduler.advance(2 / runtime.sim.clock.ratio + 2);
    runtime.sim.actions.stop();
    expect(runtime.inventory.consume(book)).toBe(true);

    expect(runtime.sim.actions.snapshotState().job).toBeNull();
    expect(runtime.sim.actions.job).toMatchObject({ jobType: 'reading', stopped: true, bookUid: book.uid });
    const snapshot = capture(runtime);
    expect(snapshot.character.longAction.job).toBeNull();
    runtime.sim.scheduler.advance(1);
    expect(runtime.sim.actions.job).toBeUndefined();
    const decoded = await decodeSave(await encodeFixture(snapshot), { version: formatVersion, contentLookup });
    expect(createRuntime(decoded.snapshot).sim.actions.job).toBeUndefined();
  });

  it('restores after eating the quickbar-bound item without a dangling UID', () => {
    const runtime = createRuntime();
    const { inventory, quickbar, survival, handling, player } = runtime;
    const beans = inventory.hands.right!.pockets![0]![0]!.item;
    const feet = player.body.pos.map(Math.floor) as import('../src/core/coords.ts').Vec3;
    expect(inventory.move(inventory.hands.left!, { kind: 'pile', pos: feet }).ok).toBe(true);
    expect(inventory.move(beans, { kind: 'hand', side: 'left' }).ok).toBe(true);
    quickbar.assign(0, beans);
    expect(survival.use(beans)).toBeUndefined();
    handling.tick(3.1);
    expect(inventory.itemByUid(beans.uid)).toBeUndefined();
    const snapshot = capture(runtime);
    expect(() => createRuntime(snapshot)).not.toThrow();
    expect(snapshot.character.quickbar[0]).toBeNull();
  });

  it('returns a held quickbar item to its captured source after a save round-trip', async () => {
    const runtime = createRuntime();
    const { inventory, player } = runtime;
    const bag = inventory.hands.right!;
    const { item } = bag.pockets![0]![0]!;
    const source = inventory.targetState(inventory.targetForLocation(inventory.locate(item)!));
    const feet = player.body.pos.map(Math.floor) as import('../src/core/coords.ts').Vec3;
    expect(inventory.move(inventory.hands.left!, { kind: 'pile', pos: feet }).ok).toBe(true);
    expect(inventory.move(item, { kind: 'hand', side: 'left' }).ok).toBe(true);

    const decoded = await decodeSave(await encodeFixture(capture(runtime)), { version: formatVersion, contentLookup });
    const restored = createRuntime(decoded.snapshot);
    const held = restored.inventory.itemByUid(item.uid)!;
    const actions = new QuickbarActions({
      inventory: restored.inventory,
      queue: restored.handling,
      feet: () => restored.player.body.pos.map(Math.floor) as import('../src/core/coords.ts').Vec3,
      survival: restored.survival,
      notice: () => undefined,
    });
    expect(restored.inventory.quickbarOrigin(held)).toEqual(source);

    actions.tap(held);
    restored.handling.tick(restored.handling.remaining);

    const at = restored.inventory.locate(held)!;
    expect(restored.inventory.targetState(restored.inventory.targetForLocation(at))).toEqual(source);
  });

  it('rejects a dangling component reference at the snapshot barrier', () => {
    const runtime = createRuntime();
    const missingUid = runtime.inventory.factory.next;
    runtime.quickbar.snapshotState = () => [missingUid, null, null, null, null];
    expect(() => capture(runtime)).toThrow(`Snapshot contains dangling item UID ${missingUid}`);
  });

  it('exports/restores scheduler cursors without changing their next due tick', () => {
    const first = new Simulation({ seed: 4 });
    let count = 0;
    first.scheduler.register({
      id: 'test',
      rate: 2,
      tick: () => {
        count += 1;
      },
    });
    first.scheduler.advance(0.6);
    const state = first.scheduler.snapshotState();
    const second = new Simulation({ seed: 4 });
    second.scheduler.register({
      id: 'test',
      rate: 2,
      tick: () => {
        count += 10;
      },
    });
    second.scheduler.restoreState(structuredClone(state));
    first.scheduler.advance(0.4);
    second.scheduler.advance(0.4);
    expect(count).toBe(12);
    expect(second.scheduler.time).toBe(first.scheduler.time);
  });

  it('stores stable-ID block deltas and restores them over matching generated chunks', () => {
    const source = new World();
    source.addChunk(new Chunk(0, 0, 0, blockId('dirt')));
    source.setBlock(1, 2, 3, blockId('planks'));
    const state = source.snapshotDiffs(blockName);
    expect(state.chunks).toEqual([
      { cx: 0, cy: 0, cz: 0, cells: [{ index: 1 + CHUNK * (3 + CHUNK * 2), base: 'dirt', id: 'planks' }] },
    ]);
    const restored = new World();
    restored.addChunk(new Chunk(0, 0, 0, blockId('dirt')));
    restored.restoreDiffs(structuredClone(state), (id) => blockId(id));
    expect(restored.getBlock(1, 2, 3)).toBe(blockId('planks'));
    restored.setBlock(1, 2, 3, blockId('dirt'));
    expect(restored.snapshotDiffs(blockName).chunks).toEqual([]);
  });

  it('projects queued tagged jobs as canceled only in the snapshot copy', () => {
    const inventory = new Inventory(registry);
    const queue = new HandlingQueue(inventory);
    let appliedAt = -1;
    queue.registerAction('test.increment', (params) => {
      appliedAt = Number(params.value);
    });
    const job = queue.enqueueAction('test.increment', 'wait', 2, { value: 19 });
    queue.tick(0.75);
    const state = queue.snapshotCancelled();
    expect(state.jobs).toEqual([]);
    expect(queue.jobs).toEqual([job]);
    expect(job.elapsed).toBe(0.75);
    queue.tick(1.25);
    expect(appliedAt).toBe(19);
    expect(job.elapsed).toBe(2);
  });

  it('snapshots an unread interrupt after death and restores the same cause and time', () => {
    const dead = new Simulation({ seed: 9 });
    dead.hurt(5, 'a bite');
    dead.hurt(1000, 'a bite');
    dead.frame(1 / 60);
    dead.frame(1 / 60);
    const state = dead.snapshotState();
    const loaded = new Simulation({ seed: 9, clock: structuredClone(state.clock) });
    loaded.restoreState(structuredClone(state));

    expect(state.dead).toEqual({ cause: 'a bite', time: dead.time });
    expect(state.pendingInterrupt).toBeUndefined();
    expect(loaded.dead).toEqual(dead.dead);
    expect(loaded.paused).toBe(true);
    expect(loaded.godMode).toBe(false);
  });

  it('snapshots an unread interrupt while paused without advancing the simulation', () => {
    const sim = new Simulation({ seed: 1 });
    sim.hurt(5, 'a bite');
    sim.paused = true;
    sim.frame(1 / 60);
    sim.frame(1 / 60);

    const state = sim.snapshotState();
    expect(state.pendingInterrupt).toBe("You're hurt");
    expect(sim.paused).toBe(true);
    expect(sim.compression.interruption).toBeUndefined();
  });

  it('round-trips signed zero and subnormal numbers through the snapshot', () => {
    const original = createRuntime();
    original.player.body.pos[0] = -0;
    original.player.body.vel[1] = Number.MIN_VALUE;
    original.sim.needs.fatigue = Number.MIN_VALUE;
    const restored = createRuntime(capture(original));

    expect(Object.is(restored.player.body.pos[0], -0)).toBe(true);
    expect(Object.is(restored.player.body.vel[1], Number.MIN_VALUE)).toBe(true);
    expect(Object.is(restored.sim.needs.fatigue, Number.MIN_VALUE)).toBe(true);
  });
});

describe('craft job codec and ownership', () => {
  it.each([false, true])(
    'encodes/restores stopped=%s work with one owned subtree and validated references',
    async (stopped) => {
      const runtime = createRuntime();
      // Use the same session/save factory as the game; clear hands through Inventory.
      const pos: import('../src/core/coords.ts').Vec3 = runtime.player.body.pos.map(
        Math.floor,
      ) as import('../src/core/coords.ts').Vec3;
      for (const item of Object.values(runtime.inventory.hands)) {
        expect(runtime.inventory.move(item!, { kind: 'pile', pos }).ok).toBe(true);
      }
      for (const [type, count] of [
        ['stick', 1],
        ['rag', 2],
        ['wax', 1],
        ['kitchen_knife', 1],
      ] as const) {
        expect(
          runtime.inventory.add(runtime.inventory.create(type, count), {
            kind: 'pile',
            pos: [pos[0] - 1, pos[1], pos[2]],
          }),
        ).toBe(true);
      }
      const planned = runtime.session.planCraft(registry.recipes.get('torch')!);
      if (!('plan' in planned)) {
        throw new Error(planned.missing.reason);
      }
      const work = runtime.inventory.beginWork(planned.plan)!;
      expect(runtime.sim.actions.startCraft(work.uid)).toBeUndefined();
      // Progress the registered native job without changing the falling scenario body's origin.
      runtime.sim.actions.craft!.advance(work.uid, 37);
      if (stopped) {
        runtime.sim.actions.stop();
      }
      const snapshot = capture(runtime);
      const bytes = await encodeFixture(snapshot);
      expect(capture(runtime)).toEqual(snapshot);
      const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
      const loaded = createRuntime(decoded.snapshot);
      expect(capture(loaded)).toEqual(snapshot);
      expect(loaded.inventory.itemByUid(work.uid)!.work).toEqual(work.work);
      expect(loaded.inventory.hands.left).toBeUndefined();
      const bad = structuredClone(snapshot);
      const badWork = bad.character.inventory.hands.right!.work!;
      if (badWork.kind !== 'craft') {
        throw new Error('Expected craft work');
      }
      badWork.recipe = 'unknown_craft';
      await expect(decodeSave(await encodeFixture(bad), { version: formatVersion, contentLookup })).rejects.toThrow(
        'Unknown recipe',
      );
      const dangling = structuredClone(snapshot);
      dangling.character.longAction.job = { jobType: 'craft', stopped: true, last: 0, workUid: 999_999 };
      await expect(encodeFixture(dangling)).rejects.toThrow('Missing craft work item');

      const disassembly = structuredClone(snapshot);
      const savedWork = disassembly.character.inventory.hands.right!;
      const sourceUid = disassembly.character.inventory.nextItemUid;
      disassembly.character.inventory.nextItemUid += 1;
      const radio = registry.items.get('portable_radio')!;
      savedWork.work = {
        kind: 'disassembly',
        source: radio.id,
        skillLevel: SKILL_LEVEL_LEGENDARY,
        toolLevels: {},
        outputs: disassemblyOutputs(radio, SKILL_LEVEL_LEGENDARY),
        gather: 0,
        elapsed: 37,
        duration: SALVAGE_DURATION,
        components: [{ uid: sourceUid, type: radio.id, count: 1, condition: 0 }],
      };
      const decodedDisassembly = await decodeSave(await encodeFixture(disassembly), {
        version: formatVersion,
        contentLookup,
      });
      const loadedDisassembly = createRuntime(decodedDisassembly.snapshot);
      expect(capture(loadedDisassembly)).toEqual(disassembly);

      const invalidDisassembly = structuredClone(disassembly);
      const invalidWork = invalidDisassembly.character.inventory.hands.right!.work!;
      if (invalidWork.kind !== 'disassembly') {
        throw new Error('Expected disassembly work');
      }
      invalidWork.skillLevel = SKILL_LEVEL_LEGENDARY + 1;
      await expect(encodeFixture(invalidDisassembly)).rejects.toThrow();
    },
  );

  it('encodes and restores an in-progress repair target and amount', async () => {
    const runtime = createRuntime();
    const pos: import('../src/core/coords.ts').Vec3 = runtime.player.body.pos.map(
      Math.floor,
    ) as import('../src/core/coords.ts').Vec3;
    for (const item of Object.values(runtime.inventory.hands)) {
      expect(runtime.inventory.move(item!, { kind: 'pile', pos }).ok).toBe(true);
    }
    const target = runtime.inventory.create('crowbar');
    target.condition = 0.2;
    expect(runtime.inventory.add(target, { kind: 'pile', pos })).toBe(true);
    for (const [type, offset] of [
      ['repair_kit', 1],
      ['scrap_metal', 2],
      ['duct_tape', 3],
    ] as const) {
      expect(
        runtime.inventory.add(runtime.inventory.create(type), {
          kind: 'pile',
          pos: [pos[0] - 1 + offset, pos[1], pos[2]],
        }),
      ).toBe(true);
    }
    const recipe = registry.recipes.get('repair_crowbar')!;
    const planned = runtime.session.planCraft(recipe);
    if (!('plan' in planned)) {
      throw new Error(planned.missing.reason);
    }
    const { amount } = recipe.repair!;
    const work = runtime.inventory.beginWork(planned.plan, { targetUid: target.uid, amount });
    if (!work) {
      throw new Error('Cannot gather repair inputs');
    }
    expect(runtime.sim.actions.startCraft(work.uid)).toBeUndefined();
    runtime.sim.actions.craft!.advance(work.uid, 37);
    const snapshot = capture(runtime);
    const bytes = await encodeFixture(snapshot);
    const decoded = await decodeSave(bytes, { version: formatVersion, contentLookup });
    const loaded = createRuntime(decoded.snapshot);
    expect(loaded.inventory.itemByUid(work.uid)!.work).toEqual(work.work);
  });
});

describe('restored session world state', () => {
  it('shares restored block entities and does not re-furnish visited columns', () => {
    const source = createRuntime();
    const container = [...source.entities.all].find((entity) => entity.pockets && !entity.searched);
    const door = [...source.entities.all].find((entity) => registry.furniture.get(entity.type)?.door);
    expect(container).toBeDefined();
    expect(door).toBeDefined();
    source.inventory.canReachEntity = () => true;
    expect(source.session.search(container!)).toBeUndefined();
    source.handling.tick(3);
    source.handling.enqueueAction('furniture.door', 'Open door', 0, { entityUid: door!.uid });
    source.handling.tick(0);
    const savedContents = container!.pockets!.map((pocket) => pocket.map((placed) => placed.item.type));
    const snapshot = capture(source);

    const loaded = createRuntime(snapshot);
    expect(loaded.entities).toBe(loaded.sharedEntities);
    const restoredContainer = loaded.entities.byUid(container!.uid)!;
    const restoredDoor = loaded.entities.byUid(door!.uid)!;
    expect(restoredContainer.pockets!.map((pocket) => pocket.map((placed) => placed.item.type))).toEqual(savedContents);
    expect(restoredContainer.searched).toBe(true);
    expect(restoredDoor.open).toBe(true);
    loaded.handling.enqueueAction('furniture.door', 'Close door', 0, { entityUid: restoredDoor.uid, closing: true });
    loaded.handling.tick(0);
    expect(loaded.sharedEntities.at(...restoredContainer.pos)).toBe(restoredContainer);
    expect(loaded.sharedEntities.isSolid(...restoredDoor.pos)).toBe(true);
    expect(loaded.inventory.entities).toBe(loaded.sharedEntities);

    const countsBefore = [...loaded.entities.all].map((entity) => [entity.uid, entity.pockets?.map((p) => p.length)]);
    for (const [cx, cz] of loaded.columns) {
      loaded.session.onColumn(cx, cz, loaded.hamlet);
    }
    expect([...loaded.entities.all].map((entity) => [entity.uid, entity.pockets?.map((p) => p.length)])).toEqual(
      countsBefore,
    );
    expect(loaded.zombies.store.size).toBe(snapshot.world.zombies.zombies.length);

    const fresh = loaded.hamlet.furnitureIn(...loaded.columns[0]!)[0]!;
    const freshSpec = {
      ...fresh.spec,
      pos: [fresh.spec.pos[0] + CHUNK * 100, ...fresh.spec.pos.slice(1)] as [number, number, number],
    };
    const freshSpawnPos: [number, number, number] = [freshSpec.pos[0] + 10, freshSpec.pos[1], freshSpec.pos[2]];
    const unseenSite = {
      furnitureIn: () => [{ spec: freshSpec, loot: fresh.loot }],
      zombiesIn: () => [{ type: 'shambler', pos: freshSpawnPos }],
    } as unknown as Site;
    loaded.session.onColumn(loaded.columns[0]![0] + 100, loaded.columns[0]![1], unseenSite);
    expect(loaded.entities.at(...freshSpec.pos)?.type).toBe(freshSpec.type);
    expect(loaded.zombies.store.size).toBe(snapshot.world.zombies.zombies.length + 1);
  });
});
