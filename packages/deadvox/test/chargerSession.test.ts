import { describe, expect, it } from 'vitest';
import { batteryEnergy } from '../src/core/battery.ts';
import { simTimestamp } from '../src/core/time.ts';
import { chargerPanel } from '../src/ui/chargerPanel.ts';
import { baseRegistry } from './baseRegistry.ts';
import { createChargerSession } from './fixtures/chargerSession.ts';

const base = baseRegistry();
const load = (runtime: ReturnType<typeof createChargerSession>) => {
  const { session, entity, batteryType } = runtime;
  const cell = session.inventory.create(batteryType);
  cell.charges = 0;
  if (!session.inventory.add(cell, { kind: 'hand', side: 'right' })) {
    throw new Error('Could not hold fixture cell');
  }
  const moved = session.inventory.move(cell, { kind: 'furniture', entity: entity!, pocket: 0 });
  if (!moved.ok) {
    throw new Error(moved.reason);
  }
  const refusal = session.chargerControl(entity!.uid, 'start');
  if (refusal) {
    throw new Error(refusal);
  }
  return cell;
};

describe('placed charger session', () => {
  it('saves power and the active cell at the same boundary between scheduled power ticks', () => {
    const runtime = createChargerSession(base);
    const cell = load(runtime);
    runtime.advance(1.5);
    const saved = runtime.snapshot();
    expect(batteryEnergy(runtime.registry, cell)).toBeGreaterThan(0);
    expect(runtime.entity!.charging!.atGameMilliseconds).toBe(saved.world.power!.atGameMilliseconds);
    expect(() => createChargerSession(base, saved)).not.toThrow();
  });
  it('takes a snapshot between power ticks without moving the network, and a restore continues as the uninterrupted run', () => {
    const uninterrupted = createChargerSession(base);
    const saving = createChargerSession(base);
    for (const runtime of [uninterrupted, saving]) {
      load(runtime);
      runtime.advance(0.5);
    }
    const { network } = saving.session.power!;
    const before = network.snapshot();
    const first = saving.snapshot();
    expect(network.snapshot()).toEqual(before);
    expect(first.world.power).toEqual(before);
    expect(saving.snapshot()).toEqual(first);
    const restored = createChargerSession(base, first);
    for (const runtime of [uninterrupted, saving, restored]) {
      runtime.advance(2);
    }
    const expected = uninterrupted.snapshot();
    expect(saving.snapshot()).toEqual(expected);
    expect(restored.snapshot()).toEqual(expected);
  });
  it('keeps charging while hands and movement work, saves a blackout, resumes and collects the same cell once', () => {
    const runtime = createChargerSession(base);
    const { session, entity } = runtime;
    const cell = load(runtime);
    const rag = session.inventory.create('rag');
    expect(session.inventory.add(rag, { kind: 'hand', side: 'right' })).toBe(true);
    runtime.advance(0.5);
    runtime.blackout(true);
    const partial = batteryEnergy(runtime.registry, cell);
    expect(partial).toBeGreaterThan(0);
    runtime.move(1);
    const before = [...session.body.pos];
    runtime.advance(0.5);
    expect(session.body.pos).not.toEqual(before);
    expect(session.inventory.hands.right).toBe(rag);
    expect(batteryEnergy(runtime.registry, cell)).toBe(partial);
    const saved = runtime.snapshot();
    const restored = createChargerSession(base, saved);
    expect(restored.entity!.uid).toBe(entity!.uid);
    const restoredCell = restored.session.inventory.itemByUid(cell.uid)!;
    expect(batteryEnergy(restored.registry, restoredCell)).toBe(partial);
    expect(
      chargerPanel(restored.entity!, restored.session.power, restored.session.reach())!.actions[0]!.payload.kind,
    ).toBe('charger.stop');
    restored.move(-1);
    restored.advance(0.5);
    restored.move(0);
    restored.blackout(false);
    restored.advance(20);
    expect(restored.entity!.charging).toBeUndefined();
    expect(batteryEnergy(restored.registry, restoredCell)).toBe(9_000_000_000);
    const id = restored.session.power!.chargerId(restored.entity!)!;
    const target = { kind: 'hand' as const, side: 'left' as const };
    expect(
      restored.session.power!.chargers!.collect(simTimestamp(restored.session.sim.time), id, target),
    ).toMatchObject({ ok: true });
    expect(restored.session.power!.chargers!.collect(simTimestamp(restored.session.sim.time), id, target).ok).toBe(
      false,
    );
    expect(restored.session.inventory.itemByUid(cell.uid)).toBe(restoredCell);
  });

  it('refuses an unreachable cell and returns partial charge on stop through ordinary handling', () => {
    const runtime = createChargerSession(base);
    const { session, entity } = runtime;
    const far = session.inventory.create(runtime.batteryType);
    far.charges = 0;
    expect(session.inventory.add(far, { kind: 'pile', pos: [100, 1, 100] })).toBe(true);
    const id = session.power!.chargerId(entity!)!;
    expect(session.power!.chargers!.start(simTimestamp(0), id, far).ok).toBe(false);
    const cell = load(runtime);
    runtime.advance(0.5);
    expect(session.chargerControl(entity!.uid, 'stop')).toBeUndefined();
    const energy = batteryEnergy(runtime.registry, cell);
    expect(energy).toBeGreaterThan(0);
    const queued = session.queue.enqueue(cell, { kind: 'hand', side: 'right' });
    expect(queued.ok).toBe(true);
    runtime.advance(2);
    expect(session.inventory.hands.right).toBe(cell);
    expect(batteryEnergy(runtime.registry, cell)).toBe(energy);
  });

  it('settles before destruction and drops the owned cell without a live endpoint or reservation', () => {
    const runtime = createChargerSession(base);
    const { session, entity } = runtime;
    const cell = load(runtime);
    runtime.advance(0.5);
    expect(session.bashFurniture(entity, 100)).toBe(true);
    expect(session.entities.byUid(entity!.uid)).toBeUndefined();
    expect(session.power!.chargerId(entity!)).toBeUndefined();
    expect(session.inventory.itemByUid(cell.uid)).toBe(cell);
    expect(entity!.charging).toBeUndefined();
    expect(() => createChargerSession(base, runtime.snapshot())).not.toThrow();
  });
});
