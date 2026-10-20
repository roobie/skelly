import { describe, expect, it } from 'vitest';
import { NEUTRAL_AIM } from '../src/core/aim.ts';
import type { Registry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { assertFirearmState, snapshotFirearm } from '../src/core/firearmState.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { defOf } from '../src/core/items.ts';
import { decodeSave, encodeSave, SAVE_SCHEMA_VERSION, type SaveVersionComponents } from '../src/core/saveFormat.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { FirearmMechanics, spentCaseItemId } from '../src/game/firearmHandling.ts';
import { RevolverHandling } from '../src/game/revolverHandling.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { content } from './fixtures/startupContent.ts';

const fixtureRegistry = (): Registry => {
  const { registry } = content;
  const source = [...registry.items.values()].find((item) => item.firearm?.revolver)!;
  const model = registry.models.get(source.model!)!;
  const ammo = [...registry.items.values()].find((item) => item.ammo?.calibre === model.calibre)!;
  const spent = registry.items.get(spentCaseItemId(model.calibre!))!;
  const calibre = 'fixture-revolver';
  return {
    ...registry,
    models: new Map(registry.models).set('fixture_revolver_model', {
      ...model,
      id: 'fixture_revolver_model',
      calibre,
      revolver: { ...model.revolver!, chambers: 4 },
    }),
    items: new Map(registry.items)
      .set('fixture_revolver', { ...source, id: 'fixture_revolver', model: 'fixture_revolver_model' })
      .set('fixture_round', { ...ammo, id: 'fixture_round', ammo: { ...ammo.ammo!, calibre } })
      .set(spentCaseItemId(calibre), { ...spent, id: spentCaseItemId(calibre) }),
  };
};
const pose = {
  feet: [0, 1, 0] as Vec3,
  eye: [0, 4, 0] as Vec3,
  yaw: 0,
  pitch: 0,
  aimFrame: NEUTRAL_AIM,
  blockSize: 0.5,
  ready: true,
  sprinting: false,
};
const fixture = () => {
  const registry = fixtureRegistry();
  const inventory = new Inventory(registry);
  const gun = inventory.create('fixture_revolver');
  const ammo = inventory.create('fixture_round', 12);
  const bagDefinition = [...registry.items.values()].find((item) => item.wearable && item.container)!;
  const bag = inventory.create(bagDefinition.id);
  if (
    !(
      inventory.add(gun, { kind: 'hand', side: 'right' }) &&
      inventory.add(bag, { kind: 'worn' }) &&
      inventory.add(ammo, { kind: 'pocket', owner: bag, pocket: 0 })
    )
  ) {
    throw new Error('Revolver fixture does not fit');
  }
  const queue = new HandlingQueue(inventory);
  const shots: unknown[] = [];
  const sounds: string[] = [];
  const mechanics = new FirearmMechanics(inventory, queue, {
    blockSize: pose.blockSize,
    pose: () => pose,
    isSolid: (_x, y) => y < pose.feet[1],
    onEjection: () => undefined,
    onShot: (shot) => shots.push(shot),
    onSound: (event) => sounds.push(event),
  });
  let time = 0;
  const finish = () => {
    const [job] = queue.jobs;
    if (!job) {
      throw new Error('No revolver job to finish');
    }
    time += job.duration - job.elapsed;
    const { failed } = queue.tick(job.duration - job.elapsed);
    if (failed.length > 0) {
      throw new Error(JSON.stringify(failed));
    }
    mechanics.advanceTo(time);
  };
  const load = () => {
    const reason = mechanics.loadNext(gun.uid, time);
    if (reason) {
      throw new Error(reason);
    }
    finish();
  };
  const release = () => {
    mechanics.releaseLoad(gun.uid, time);
    while (queue.busy) {
      finish();
    }
  };
  const fire = () => {
    time += defOf(registry, gun.type).firearm!.revolver!.recoverySimSeconds;
    const fired = mechanics.fire({ ...pose, item: gun, simTime: time, seed: 7 });
    if (queue.busy) {
      finish();
    }
    return fired;
  };
  const cylinder = () => gun.firearm!.cylinder!;
  const rounds = () => cylinder().chambers.filter((chamber) => chamber.state === 'round').length;
  const startLoaded = (count: number) => {
    load();
    for (let i = 0; i < count; i++) {
      load();
    }
    release();
  };
  return {
    registry,
    inventory,
    gun,
    ammo,
    queue,
    mechanics,
    shots,
    sounds,
    finish,
    load,
    release,
    fire,
    cylinder,
    rounds,
    startLoaded,
    time: () => time,
  };
};

describe('revolver cylinder handling', () => {
  it.each(['release', 'dump', 'pull', 'cock'] as const)(
    'owner cancellation matches the full inventory scan for %s after moving between steps',
    (operation) => {
      const make = () => {
        const { inventory, gun } = fixture();
        const queue = new HandlingQueue(inventory);
        const events: string[] = [];
        const owner = new RevolverHandling(inventory, queue, {
          factor: () => 1,
          sound: (event) => events.push(event),
          eject: () => events.push('eject'),
          caseType: () => spentCaseItemId('fixture-revolver'),
        });
        return { inventory, gun, queue, events, owner };
      };
      const optimized = make();
      const plain = make();
      const cancel = (f: ReturnType<typeof make>) => {
        f.owner.advance();
        if (f === optimized) {
          f.owner.cancelUnheld();
        } else {
          for (const { item } of f.inventory.items()) {
            if (item.firearm?.cylinder && !Object.values(f.inventory.hands).includes(item)) {
              f.owner.cancel(item.uid);
            }
          }
        }
      };
      const state = (f: ReturnType<typeof make>) => ({
        jobs: structuredClone(f.queue.jobs),
        firearm: snapshotFirearm(f.gun.firearm!),
        events: f.events,
      });
      for (const f of [optimized, plain]) {
        if (operation === 'dump') {
          expect(f.owner.dump(f.gun, 0)).toBeUndefined();
        } else if (operation === 'pull') {
          f.owner.pull(f.gun, 0, () => f.events.push('shot'));
        } else {
          expect(f.owner.cock(f.gun, 0)).toBeUndefined();
          if (operation === 'release') {
            f.owner.release(f.gun.uid, 0);
          }
        }
        cancel(f);
        expect(f.queue.busy).toBe(true);
        expect(f.inventory.move(f.gun, { kind: 'pile', pos: [0, 1, 0] }).ok).toBe(true);
        cancel(f);
        expect(f.queue.busy).toBe(false);
        expect(f.inventory.move(f.gun, { kind: 'hand', side: 'right' }).ok).toBe(true);
        expect(f.owner.load(f.gun, 1)).toBeUndefined();
        const [job] = f.queue.jobs;
        expect(job).toBeDefined();
        expect(f.queue.tick(job!.duration).failed).toEqual([]);
        cancel(f);
      }
      expect(state(optimized)).toEqual(state(plain));
      expect(optimized.queue.busy).toBe(false);
      expect(optimized.gun.firearm!.cylinder!.open).toBe(true);
    },
  );

  it('loads only with the non-gun hand free, whichever hand holds the gun', () => {
    for (const side of ['right', 'left'] as const) {
      const f = fixture();
      const pocket = f.inventory.locate(f.ammo)!;
      if (pocket.kind !== 'pocket') {
        throw new Error('Fixture ammunition needs a carried pocket');
      }
      if (side === 'left') {
        expect(f.inventory.move(f.gun, { kind: 'hand', side }).ok).toBe(true);
      }
      const other = side === 'right' ? 'left' : 'right';
      expect(f.inventory.move(f.ammo, { kind: 'hand', side: other }).ok).toBe(true);
      const before = snapshotFirearm(f.gun.firearm!);
      const carried = f.ammo.count;
      expect(f.mechanics.loadNext(f.gun.uid, f.time())).toBeTypeOf('string');
      expect(f.queue.busy).toBe(false);
      expect(snapshotFirearm(f.gun.firearm!)).toEqual(before);
      expect(f.ammo.count).toBe(carried);
      expect(f.inventory.move(f.ammo, pocket).ok).toBe(true);
      f.load();
      f.load();
      expect(f.rounds()).toBe(1);
      expect(f.ammo.count).toBe(carried - 1);
    }
  });

  it('a partial load feeds the next double-action strike, not the previously aligned chamber', () => {
    const f = fixture();
    const { aligned } = f.cylinder();
    f.startLoaded(1);
    expect(f.cylinder().aligned).toBe(aligned);
    f.fire();
    expect(f.shots).toHaveLength(1);
    expect(f.cylinder().aligned).toBe((aligned + 1) % f.cylinder().chambers.length);
    expect(f.cylinder().chambers[f.cylinder().aligned]!.state).toBe('case');
  });

  it('cocking advances once; the single-action strike keeps that chamber and lowers the hammer', () => {
    const f = fixture();
    f.startLoaded(2);
    const previous = f.cylinder().aligned;
    expect(f.mechanics.cock(f.gun.uid, f.time())).toBeUndefined();
    f.finish();
    const { aligned } = f.cylinder();
    expect(aligned).toBe((previous + 1) % f.cylinder().chambers.length);
    expect(f.cylinder().cocked).toBe(true);
    expect(f.mechanics.cock(f.gun.uid, f.time())).toBeUndefined();
    expect(f.queue.busy).toBe(false);
    f.fire();
    expect(f.shots).toHaveLength(1);
    expect(f.cylinder().aligned).toBe(aligned);
    expect(f.cylinder().cocked).toBe(false);
  });

  it('empty chambers and spent cases click without a shot while advancing the cylinder', () => {
    const f = fixture();
    f.startLoaded(1);
    f.fire();
    const shots = f.shots.length;
    for (const _chamber of f.cylinder().chambers) {
      const previous = f.cylinder().aligned;
      f.fire();
      expect(f.cylinder().aligned).toBe((previous + 1) % f.cylinder().chambers.length);
      expect(f.shots).toHaveLength(shots);
    }
    expect(f.sounds.filter((sound) => sound === 'revolver_dry_click')).toHaveLength(f.cylinder().chambers.length);
  });

  it('an open crane refuses a shot without rotating or losing ammunition', () => {
    const f = fixture();
    f.load();
    f.load();
    const before = snapshotFirearm(f.gun.firearm!);
    expect(f.mechanics.fireReason(f.gun.uid)).toBeDefined();
    expect(f.fire()).toBe(false);
    expect(f.gun.firearm).toEqual(before);
    expect(f.shots).toHaveLength(0);
  });

  it('a top-up picks only cases and keeps every remaining live chamber', () => {
    const f = fixture();
    f.startLoaded(3);
    f.fire();
    const live = f.cylinder().chambers.flatMap((chamber, index) => (chamber.state === 'round' ? [index] : []));
    expect(live.length).toBeGreaterThan(0);
    f.load();
    expect(f.mechanics.loadNext(f.gun.uid, f.time())).toBeUndefined();
    expect(f.mechanics.frames()[0]!.revolver!.step).toBe('pick');
    f.finish();
    for (const index of live) {
      expect(f.cylinder().chambers[index]!.state).toBe('round');
    }
    expect(f.cylinder().chambers.some((chamber) => chamber.state === 'case')).toBe(false);
  });

  it('rounds and cases are conserved through loading, shooting, picking and deliberate dumping', () => {
    const f = fixture();
    const starting = f.ammo.count;
    const caseType = spentCaseItemId('fixture-revolver');
    const totals = () => {
      const carried = [...f.inventory.items()].reduce(
        (sum, { item }) => sum + (item.type === f.ammo.type ? item.count : 0),
        0,
      );
      const groundCases = [...f.inventory.items()].reduce(
        (sum, { item }) => sum + (item.type === caseType ? item.count : 0),
        0,
      );
      const landings = f.gun.firearm!.landings ?? [];
      return {
        live: carried + f.rounds() + landings.filter((item) => item.type === f.ammo.type).length,
        cases:
          groundCases +
          f.cylinder().chambers.filter((chamber) => chamber.state === 'case').length +
          landings.filter((item) => item.type === caseType).length,
      };
    };
    const check = () => {
      expect(totals()).toEqual({ live: starting - f.shots.length, cases: f.shots.length });
    };
    f.load();
    check();
    f.load();
    check();
    f.load();
    check();
    f.release();
    check();
    f.fire();
    check();
    f.load();
    check();
    f.load();
    check();
    f.load();
    check();
    f.release();
    check();
    f.fire();
    check();
    expect(f.mechanics.removeMagazine(f.gun.uid, f.time())).toBeUndefined();
    f.finish();
    check();
    f.finish();
    check();
    expect(f.cylinder().open).toBe(true);
    expect(f.cylinder().chambers.every((chamber) => chamber.state === 'empty')).toBe(true);
    f.mechanics.advanceTo(f.time() + 1);
    check();
  });

  it.each(['open', 'eject', 'pick', 'load', 'close', 'cock', 'pull'] as const)(
    'cancelling %s preserves the last completed step and carried rounds',
    (step) => {
      const f = fixture();
      if (['pick', 'eject'].includes(step)) {
        f.startLoaded(step === 'pick' ? 2 : 1);
        f.fire();
        f.load();
      } else if (step === 'load' || step === 'close') {
        f.load();
      }
      if (step === 'close') {
        f.mechanics.releaseLoad(f.gun.uid, f.time());
      } else if (step === 'cock') {
        expect(f.mechanics.cock(f.gun.uid, f.time())).toBeUndefined();
      } else if (step === 'pull') {
        expect(f.mechanics.fire({ ...pose, item: f.gun, seed: 7, simTime: f.time() })).toBe(true);
      } else {
        expect(f.mechanics.loadNext(f.gun.uid, f.time())).toBeUndefined();
      }
      expect(f.mechanics.frames()[0]!.revolver!.step).toBe(step);
      const before = snapshotFirearm(f.gun.firearm!);
      const ammo = f.ammo.count;
      f.queue.tick(f.queue.jobs[0]!.duration / 2);
      f.mechanics.cancelLoad(f.gun.uid);
      f.queue.tick(1);
      f.mechanics.advanceTo(f.time());
      expect(f.gun.firearm).toEqual(before);
      expect(f.ammo.count).toBe(ammo);
      expect(f.queue.busy).toBe(false);
    },
  );

  it('release finishes a current insertion then closes; dropping during close keeps the crane open', () => {
    const f = fixture();
    f.load();
    expect(f.mechanics.loadNext(f.gun.uid, f.time())).toBeUndefined();
    f.mechanics.releaseLoad(f.gun.uid, f.time());
    f.finish();
    expect(f.rounds()).toBe(1);
    expect(f.mechanics.frames()[0]!.revolver!.step).toBe('close');
    expect(f.inventory.move(f.gun, { kind: 'pile', pos: [0, 1, 0] }).ok).toBe(true);
    f.mechanics.advanceTo(f.time());
    f.queue.tick(1);
    expect(f.gun.firearm!.cylinder!.open).toBe(true);
  });

  it('a mid-reload save round-trip restores the open mixed cylinder with independent ownership', async () => {
    const f = fixture();
    f.startLoaded(3);
    f.fire();
    f.load();
    const session = createSession({
      registry: f.registry,
      world: new World(),
      isSolid: () => false,
      isOpaque: () => false,
      scale: makeScale(0.5),
      seed: 7,
      start: 0,
      spawn: [0, 0, 0],
      ready: () => false,
      controls: {
        active: () => false,
        intent: () => IDLE,
        yaw: () => 0,
        pitch: () => 0,
        walking: () => false,
        descending: () => false,
      },
      audio: { play: () => undefined },
      notice: () => undefined,
      onRead: () => undefined,
    });
    const snapshot = session.snapshot({ worldId: 'fixture-world', characterId: 'fixture-character' });
    const saved = { ...snapshot, character: { ...snapshot.character, inventory: f.inventory.snapshotState() } };
    const version: SaveVersionComponents = {
      simulationHash: 'a'.repeat(64),
      schemaVersion: SAVE_SCHEMA_VERSION,
      generators: {},
      contentPacks: [],
    };
    const bytes = await encodeSave(saved, {
      version,
      generation: 1,
      worldOptions: { blockSize: 0.5, site: 'fixture', storeys: 1, density: null },
    });
    const decoded = await decodeSave(bytes, { version, contentLookup: () => true });
    const restored = Inventory.restoreState(f.registry, decoded.snapshot.character.inventory);
    expect(restored.hands.right!.firearm).toEqual(f.gun.firearm);
    expect(restored.hands.right!.firearm!.cylinder).not.toBe(f.cylinder());
    expect(f.cylinder().open).toBe(true);
    expect(new Set(f.cylinder().chambers.map((chamber) => chamber.state)).size).toBeGreaterThan(1);
    expect(() => assertFirearmState({ ...snapshotFirearm(f.gun.firearm!), chamber: 'empty' })).toThrow();
  });
});
