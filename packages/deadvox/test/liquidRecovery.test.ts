import { describe, expect, it } from 'vitest';
import { Character, practiceForNextLevel } from '../src/core/character.ts';
import { CraftCommands } from '../src/core/craftCommands.ts';
import { craftActionHooks } from '../src/core/craftWork.ts';
import { disassemblyLiquidOutputs, planDisassembly } from '../src/core/disassembly.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { restoreItem, snapshotItem } from '../src/core/items.ts';
import { bindReach } from '../src/core/reach.ts';
import { decodeSave } from '../src/core/saveFormat.ts';
import {
  applyReplayActionPayload,
  isReplayActionPayload,
  type ReplayActionPayload,
  type ReplayCommandOwners,
} from '../src/game/replayCommands.ts';
import { contentLookup } from '../src/ui/saveController.ts';
import { baseRegistryWith } from './baseRegistry.ts';
import { BASE_CLOCK } from './dayPhaseFixture.ts';
import { fixtureSources } from './economyFixtures.ts';
import { BURN_RESULT, FULL, OTHER, RESULT, STOCK, VESSEL } from './liquidCraftFixture.ts';
import { liquidRecoveryData, RECOVERY_SKILL, SALVAGE_SKILL } from './liquidRecoveryFixture.ts';
import { Simulation } from './simulationFixture.ts';
import { capture, createRuntime, encodeFixture, formatVersion } from './snapshotTestSupport.ts';

const registry = baseRegistryWith(fixtureSources([{ source: 'fixture-liquid-recovery', data: liquidRecoveryData() }]));
const origin: [number, number, number] = [0, 0, 0];
const stage = (ok: boolean): void => {
  if (!ok) {
    throw new Error('Cannot stage recovery fixture');
  }
};
const setup = (saved?: ReturnType<Inventory['snapshotState']>) => {
  const character = new Character(registry);
  const inventory = saved
    ? Inventory.restoreState(registry, saved)
    : new Inventory(registry, undefined, undefined, character);
  const reach = bindReach({ inventory, position: origin, blockSize: 0.5, clock: BASE_CLOCK });
  const sim = new Simulation({ seed: 1 });
  sim.actions.craft = craftActionHooks(inventory, character, reach, {
    feet: () => origin,
    calendar: () => sim.calendar,
  });
  const commands = new CraftCommands({ inventory, character, sim, queue: new HandlingQueue(inventory), reach });
  const add = (type: string) => {
    const item = inventory.create(type);
    stage(inventory.add(item, { kind: 'pile', pos: origin }));
    return item;
  };
  const source = (record = [{ liquid: STOCK, volumeMicrolitres: 4000 }], type = RESULT, burnShare?: number) => {
    const state = { ...snapshotItem(inventory.create(type)), craftedLiquids: record };
    if (burnShare !== undefined) {
      state.burnRemainingGameSeconds = registry.items.get(type)!.light!.burnTimeGameHours! * burnShare;
    }
    const item = restoreItem(registry, state);
    stage(inventory.add(item, { kind: 'pile', pos: origin }));
    return item;
  };
  const finish = (work: NonNullable<ReturnType<Inventory['itemByUid']>>) => {
    if (!work.work) {
      throw new Error('Missing running recovery');
    }
    sim.scheduler.advance(Math.ceil(work.work.duration / sim.clock.ratio) + 1);
  };
  return { character, inventory, reach, sim, commands, add, source, finish };
};
const payload = (r: ReturnType<typeof setup>) => {
  const item = r.inventory.hands.right!;
  if (item?.work?.kind !== 'disassembly') {
    throw new Error('Not recovery work');
  }
  return { item, work: item.work };
};
const volume = (item: { liquidContents?: { kind: string; volumeMicrolitres?: number } }) =>
  item.liquidContents?.volumeMicrolitres ?? 0;

const replay = (r: ReturnType<typeof setup>, action: ReplayActionPayload): string | undefined => {
  if (!isReplayActionPayload(action)) {
    throw new Error('Invalid recovery replay fixture');
  }
  const owners = new Proxy(
    { work: (...args: Parameters<ReplayCommandOwners['work']>) => r.commands.act(...args) },
    {
      get: (target, key) =>
        key === 'work'
          ? target.work
          : () => {
              throw new Error(`Unexpected owner ${String(key)}`);
            },
    },
  ) as ReplayCommandOwners;
  return applyReplayActionPayload(action, owners);
};

describe('recorded liquid recovery', () => {
  it.each(['disassembly', 'salvage'] as const)(
    'the spill-labelled %s click approves spilling all',
    (recoveryOperation) => {
      const r = setup();
      const source = r.source();
      const projection = r.commands.recovery(source.uid, { recoveryOperation })!;
      expect(projection.refusal).toBeUndefined();
      expect(projection.spillLabel).toBeDefined();
      expect(projection.choices.spillApproval).toEqual(projection.spills);
      expect(r.commands.act(source.uid, 'disassemble', projection.choices)).toBeUndefined();
      const { item, work } = payload(r);
      expect(work.operation).toBe(recoveryOperation);
      expect(work.spillApproval).toEqual(work.liquids);
      r.finish(item);
      expect(item.work).toBeUndefined();
      expect(r.inventory.itemByUid(source.uid)).toBeUndefined();
    },
  );
  it('pours exactly the room and spills only the approved remainder', () => {
    const r = setup();
    const source = r.source();
    const receiver = r.add(VESSEL);
    const plan = planDisassembly(source, r.reach(), r.character)!;
    const recovered = plan.liquids[0]!.volumeMicrolitres;
    const room = registry.items.get(VESSEL)!.vessel!.capacityMicrolitres;
    expect(recovered).toBeGreaterThan(room);
    const choices = {
      receivers: [{ liquid: STOCK, uid: receiver.uid }],
      spillApproval: [{ liquid: STOCK, volumeMicrolitres: recovered - room }],
    };
    const receipt = r.inventory.planLiquidReceipts(plan.liquids, choices);
    expect(receipt).toMatchObject({ ok: true, spills: [{ liquid: STOCK, volumeMicrolitres: recovered - room }] });
    expect(r.commands.act(source.uid, 'disassemble', choices)).toBeUndefined();
    const { item } = payload(r);
    expect(volume(receiver)).toBe(0);
    r.finish(item);
    expect(volume(receiver)).toBe(room);
    expect(item.work).toBeUndefined();
  });
  it.each(['approve', 'replace'] as const)(
    'retains finished work after room shrinks and Continue can %s',
    (resolution) => {
      const r = setup();
      const source = r.source();
      const receiver = r.add(VESSEL);
      const donor = r.add(FULL);
      const recovered = planDisassembly(source, r.reach(), r.character)!.liquids[0]!.volumeMicrolitres;
      const room = registry.items.get(VESSEL)!.vessel!.capacityMicrolitres;
      expect(
        replay(r, {
          kind: 'inventory.work',
          itemUid: source.uid,
          operation: 'disassemble',
          receivers: [{ liquid: STOCK, uid: receiver.uid }],
          spillApproval: [{ liquid: STOCK, volumeMicrolitres: recovered - room }],
        }),
      ).toBeUndefined();
      const { item, work } = payload(r);
      stage(r.inventory.transferLiquid(donor.uid, receiver.uid, 100).ok);
      const before = snapshotItem(receiver);
      r.finish(item);
      expect(item.work).toBe(work);
      expect(work.elapsed).toBe(work.duration);
      expect(snapshotItem(receiver)).toEqual(before);
      expect(r.sim.actions.job).toMatchObject({ stopped: true, workUid: item.uid });
      const replacement = resolution === 'replace' ? r.add(VESSEL) : receiver;
      const selection = resolution === 'replace' ? { receivers: [{ liquid: STOCK, uid: replacement.uid }] } : {};
      const projected = r.commands.recovery(item.uid, selection)!;
      expect(projected.refusal).toBeUndefined();
      if (resolution === 'approve') {
        expect(projected.spillLabel).toBeDefined();
        expect(projected.choices.spillApproval).toEqual([
          { liquid: STOCK, volumeMicrolitres: recovered - room + volume(receiver) },
        ]);
        stage(r.inventory.transferLiquid(donor.uid, receiver.uid, 1).ok);
        expect(
          replay(r, { kind: 'inventory.work', itemUid: item.uid, operation: 'continue', ...projected.choices }),
        ).toBeDefined();
        expect(item.work).toBe(work);
      }
      const refreshed = r.commands.recovery(item.uid, selection)!;
      expect(
        replay(r, { kind: 'inventory.work', itemUid: item.uid, operation: 'continue', ...refreshed.choices }),
      ).toBeUndefined();
      r.sim.scheduler.advance(1);
      expect(item.work).toBeUndefined();
      expect(volume(replacement)).toBe(room);
      if (resolution === 'replace') {
        expect(snapshotItem(receiver)).toEqual(before);
      }
    },
  );
  it('recovers several kinds into separate receivers and never shares one receiver across kinds', () => {
    const r = setup();
    const source = r.source([
      { liquid: OTHER, volumeMicrolitres: 100 },
      { liquid: STOCK, volumeMicrolitres: 100 },
    ]);
    const receivers = [r.add(VESSEL), r.add(VESSEL)];
    const plan = planDisassembly(source, r.reach(), r.character)!;
    expect(
      r.commands.act(source.uid, 'disassemble', {
        receivers: plan.liquids.map(({ liquid }) => ({ liquid, uid: receivers[0]!.uid })),
      }),
    ).toBeDefined();
    expect(volume(receivers[0]!)).toBe(0);
    expect(
      r.commands.act(source.uid, 'disassemble', {
        receivers: plan.liquids.map(({ liquid }, index) => ({ liquid, uid: receivers[index]!.uid })),
      }),
    ).toBeUndefined();
    const { item } = payload(r);
    r.finish(item);
    for (const [index, liquid] of plan.liquids.entries()) {
      expect(receivers[index]!.liquidContents).toEqual({ kind: 'filled', ...liquid });
    }
  });
  it('requires approval per kind and never overwrites the other kind in a receiver', () => {
    const r = setup();
    const source = r.source([
      { liquid: OTHER, volumeMicrolitres: 100 },
      { liquid: STOCK, volumeMicrolitres: 100 },
    ]);
    const receiver = r.add(VESSEL);
    const plan = planDisassembly(source, r.reach(), r.character)!;
    const choices = { receivers: [{ liquid: STOCK, uid: receiver.uid }] };
    expect(
      r.commands.act(source.uid, 'disassemble', {
        ...choices,
        spillApproval: plan.liquids.filter(({ liquid }) => liquid === STOCK),
      }),
    ).toBeDefined();
    expect(
      r.commands.act(source.uid, 'disassemble', {
        ...choices,
        spillApproval: plan.liquids.filter(({ liquid }) => liquid === OTHER),
      }),
    ).toBeUndefined();
    const { item } = payload(r);
    r.finish(item);
    expect(receiver.liquidContents).toEqual({
      kind: 'filled',
      ...plan.liquids.find(({ liquid }) => liquid === STOCK)!,
    });
    expect(
      r.inventory.planLiquidReceipts([{ liquid: OTHER, volumeMicrolitres: 1 }], {
        receivers: [{ liquid: OTHER, uid: receiver.uid }],
        spillApproval: [{ liquid: OTHER, volumeMicrolitres: 1 }],
      }),
    ).toMatchObject({ ok: false, reason: 'incompatible-liquid' });
  });
  it('snapshots salvage using its own skill while leaving solid salvage fixed', () => {
    const r = setup();
    const source = r.source();
    r.character.awardPractice(RECOVERY_SKILL, practiceForNextLevel(registry, 0), 1);
    const low = planDisassembly(source, r.reach(), r.character, { operation: 'salvage' })!;
    expect(low.skillLevel).toBe(r.character.skills[SALVAGE_SKILL]);
    expect(low.skillLevel).not.toBe(r.character.skills[RECOVERY_SKILL]);
    expect(
      r.commands.act(source.uid, 'disassemble', { recoveryOperation: 'salvage', spillApproval: low.liquids }),
    ).toBeUndefined();
    const { item, work } = payload(r);
    r.character.awardPractice(SALVAGE_SKILL, practiceForNextLevel(registry, 0), 1);
    const high = disassemblyLiquidOutputs(registry, source, r.character.skills[SALVAGE_SKILL]!, {
      operation: 'salvage',
    });
    expect(high[0]!.volumeMicrolitres).toBeGreaterThan(low.liquids[0]!.volumeMicrolitres);
    expect(work.liquids).toEqual(low.liquids);
    expect(work.outputs).toEqual(registry.items.get(RESULT)!.salvage);
    r.finish(item);
    expect(item.work).toBeUndefined();
  });
  it('scales recovery by each instance burn while preserving burn and provenance through restore', () => {
    const r = setup();
    const record = [{ liquid: STOCK, volumeMicrolitres: 100 }];
    const fresh = r.source(record, BURN_RESULT);
    const burnt = r.source(record, BURN_RESULT, 0.5);
    const restored = restoreItem(registry, snapshotItem(burnt));
    expect(snapshotItem(restored)).toEqual(snapshotItem(burnt));
    const full = disassemblyLiquidOutputs(registry, fresh, 1);
    const partial = disassemblyLiquidOutputs(registry, restored, 1);
    expect(partial[0]!.volumeMicrolitres).toBeLessThan(full[0]!.volumeMicrolitres);
    expect(full[0]!.volumeMicrolitres).toBeLessThanOrEqual(record[0]!.volumeMicrolitres);
  });
  it('a found item without a consumption record returns no liquid', () => {
    const r = setup();
    const source = r.add(RESULT);
    expect(planDisassembly(source, r.reach(), r.character)!.liquids).toEqual([]);
    expect(r.commands.act(source.uid, 'disassemble')).toBeUndefined();
    r.finish(payload(r).item);
  });
  it('running recovery round-trips with receivers and approval and rejects liquid above its record', async () => {
    const r = setup();
    const source = r.source();
    const receiver = r.add(VESSEL);
    const plan = planDisassembly(source, r.reach(), r.character)!;
    expect(
      r.commands.act(source.uid, 'disassemble', {
        receivers: [{ liquid: STOCK, uid: receiver.uid }],
        spillApproval: plan.liquids,
      }),
    ).toBeUndefined();
    r.sim.scheduler.advance(1);
    r.sim.actions.stop();
    const { item } = payload(r);
    const saved = r.inventory.snapshotState();
    const snapshot = structuredClone(capture(createRuntime()));
    snapshot.character.inventory = structuredClone(saved);
    snapshot.character.simulation = structuredClone(r.sim.snapshotState());
    snapshot.character.longAction = structuredClone(r.sim.actions.snapshotState());
    snapshot.character.progression = structuredClone(r.character.snapshotState());
    snapshot.character.quickbar = snapshot.character.quickbar.map(() => null);
    snapshot.character.lightUid = null;
    const decoded = await decodeSave(await encodeFixture(snapshot), {
      version: formatVersion,
      contentLookup: (kind, id, savedItem) => contentLookup(registry, kind, id, savedItem),
    });
    const loaded = setup(decoded.snapshot.character.inventory);
    expect(snapshotItem(loaded.inventory.itemByUid(item.uid)!)).toEqual(snapshotItem(item));
    expect(loaded.commands.act(item.uid, 'continue')).toBeUndefined();
    loaded.finish(loaded.inventory.itemByUid(item.uid)!);
    expect(loaded.inventory.itemByUid(item.uid)).toBeUndefined();
    expect(volume(loaded.inventory.itemByUid(receiver.uid)!)).toBe(
      registry.items.get(VESSEL)!.vessel!.capacityMicrolitres,
    );
    const bad = structuredClone(saved);
    const work = bad.hands.right!.work!;
    if (work.kind !== 'disassembly') {
      throw new Error('Missing saved recovery');
    }
    work.liquids[0]!.volumeMicrolitres = source.craftedLiquids![0]!.volumeMicrolitres + 1;
    expect(() => Inventory.restoreState(registry, bad)).toThrow();
  });
  it('drop-placement failure leaves recovery receivers unchanged and the source escrowed', () => {
    const r = setup();
    const source = r.source([{ liquid: STOCK, volumeMicrolitres: 100 }]);
    const receiver = r.add(VESSEL);
    expect(
      r.commands.act(source.uid, 'disassemble', {
        recoveryOperation: 'salvage',
        receivers: [{ liquid: STOCK, uid: receiver.uid }],
      }),
    ).toBeUndefined();
    const { item, work } = payload(r);
    expect(work.outputs.length).toBeGreaterThan(0);
    r.inventory.landing = () => undefined;
    expect(() => r.inventory.releaseWork(item, true, origin)).toThrow();
    expect(volume(receiver)).toBe(0);
    expect(item.work).toBe(work);
  });
  it('the receipt mutation owner changes no vessel when a later receiver refuses', () => {
    const r = setup();
    const receivers = [r.add(VESSEL), r.add(VESSEL)];
    const donor = r.add(FULL);
    stage(r.inventory.transferLiquid(donor.uid, receivers[1]!.uid, 1).ok);
    const before = receivers.map((receiver) => snapshotItem(receiver));
    const liquids = [
      { liquid: STOCK, volumeMicrolitres: 10 },
      { liquid: OTHER, volumeMicrolitres: 10 },
    ];
    expect(
      r.inventory.receiveLiquids(liquids, {
        receivers: liquids.map(({ liquid }, index) => ({ liquid, uid: receivers[index]!.uid })),
        spillApproval: liquids,
      }),
    ).toMatchObject({ ok: false, reason: 'incompatible-liquid' });
    expect(receivers.map((receiver) => snapshotItem(receiver))).toEqual(before);
  });
  it('replay rejects malformed receiving choices before dispatch', () => {
    const action = { kind: 'inventory.work', itemUid: 1, operation: 'disassemble' };
    expect(isReplayActionPayload({ ...action, receivers: [{ liquid: STOCK, uid: 0 }] })).toBe(false);
    expect(isReplayActionPayload({ ...action, spillApproval: [{ liquid: STOCK, volumeMicrolitres: -1 }] })).toBe(false);
    expect(isReplayActionPayload({ ...action, recoveryOperation: 'craft' })).toBe(false);
  });
  it('taking recovery work apart returns the recorded source without pouring anything', () => {
    const r = setup();
    const source = r.source();
    const before = snapshotItem(source);
    const plan = planDisassembly(source, r.reach(), r.character)!;
    expect(r.commands.act(source.uid, 'disassemble', { spillApproval: plan.liquids })).toBeUndefined();
    const { item } = payload(r);
    expect(r.commands.act(item.uid, 'apart')).toBeUndefined();
    expect(snapshotItem(r.inventory.itemByUid(source.uid)!)).toEqual(before);
  });
});
