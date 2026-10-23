// biome-ignore-all lint/suspicious/noMisplacedAssertion: fixture helpers run synchronously inside the tests.
import { expect, it } from 'vitest';
import { NEUTRAL_AIM } from '../src/core/aim.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import { defOf } from '../src/core/items.ts';
import { FirearmMechanics, spentCaseItemId } from '../src/game/firearmHandling.ts';
import { type PracticeGun, TutorialWeapons } from '../src/game/tutorialWeapons.ts';
import { Unpacking } from '../src/game/unpacking.ts';
import { content } from './fixtures/startupContent.ts';

const fixture = (kind: PracticeGun) => {
  const base = content.registry;
  const source = [...base.items.values()].find((item) =>
    kind === 'revolver' ? item.firearm?.revolver : item.firearm?.pump,
  )!;
  const model = base.models.get(source.model!)!;
  const ammo = [...base.items.values()].find((item) => item.ammo?.calibre === model.gun!.calibre)!;
  const box = [...base.items.values()].find((item) => item.unpack?.item === ammo.id)!;
  const calibre = `practice-fixture-${kind}`;
  const registry = {
    ...base,
    models: new Map(base.models).set('practice-model', {
      ...model,
      id: 'practice-model',
      gun: {
        ...model.gun,
        calibre,
        ...(kind === 'revolver'
          ? { revolver: { ...model.gun!.revolver!, chambers: 4 } }
          : { internalMagazine: { capacity: 3 } }),
      },
    }),
    items: new Map(base.items)
      .set('practice-gun', { ...source, id: 'practice-gun', model: 'practice-model' })
      .set('practice-ammo', { ...ammo, id: 'practice-ammo', ammo: { ...ammo.ammo!, calibre } })
      .set('practice-box', { ...box, id: 'practice-box', unpack: { ...box.unpack!, item: 'practice-ammo', count: 12 } })
      .set(spentCaseItemId(calibre), {
        ...base.items.get(spentCaseItemId(model.gun!.calibre!))!,
        id: spentCaseItemId(calibre),
      }),
  };
  const inventory = new Inventory(registry);
  const queue = new HandlingQueue(inventory);
  const observer = new TutorialWeapons();
  const gun = inventory.create('practice-gun');
  const packageItem = inventory.create('practice-box');
  const bag = inventory.create('hiking_backpack');
  expect(inventory.add(bag, { kind: 'worn' })).toBe(true);
  expect(inventory.add(packageItem, { kind: 'hand', side: 'right' })).toBe(true);
  const unpack = new Unpacking(inventory, queue, () => [0, 1, 0], {
    unpacked: (type) => observer.unpackedAmmo(type),
  });
  expect(unpack.activate(packageItem)).toBeUndefined();
  expect(queue.tick(queue.remaining).failed).toEqual([]);
  expect(inventory.add(gun, { kind: 'hand', side: 'right' })).toBe(true);
  const pose = { feet: [0, 1, 0] as Vec3, eye: [0, 4, 0] as Vec3, yaw: 0, pitch: 0, blockSize: 0.5 };
  const mechanics = new FirearmMechanics(inventory, queue, {
    ...pose,
    pose: () => pose,
    isSolid: (_x, y) => y < 1,
    onEjection: () => undefined,
    onHandlingOutcome: (item, event) => observer.handling(item, event, registry),
    onShot: (_shot, _time, item, sighted) => observer.discharged(item, sighted, registry),
  });
  let time = 0;
  const finish = () => {
    expect(queue.busy).toBe(true);
    const duration = queue.remaining;
    time += duration;
    expect(queue.tick(duration).failed).toEqual([]);
    mechanics.advanceTo(time);
  };
  const load = () => {
    expect(mechanics.loadNext(gun.uid, time)).toBeUndefined();
    finish();
  };
  const close = () => {
    mechanics.releaseLoad(gun.uid, time);
    while (queue.busy) {
      finish();
    }
  };
  const rack = () => {
    expect(mechanics.cock(gun.uid, time)).toBeUndefined();
    finish();
  };
  const pull = (sighted = false) => {
    time += defOf(registry, gun.type).firearm?.revolver?.recoverySimSeconds ?? 1;
    return mechanics.fire({
      ...pose,
      aimFrame: NEUTRAL_AIM,
      item: gun,
      seed: 7,
      simTime: time,
      ready: true,
      sprinting: false,
      aimingDownSights: sighted,
    });
  };
  observer.wielded(gun, registry);
  observer.inspected(gun, registry);
  return {
    observer,
    registry,
    inventory,
    queue,
    gun,
    mechanics,
    finish,
    load,
    close,
    rack,
    pull,
    time: () => time,
    lesson: () => observer.lesson(kind),
  };
};

it('revolver credits committed discharge, not queued or cancelled pulls, then case recovery and live unloading', () => {
  const f = fixture('revolver');
  expect(f.lesson()).toBe('partial');
  f.load(); // open
  expect(f.lesson()).toBe('partial');
  expect(f.mechanics.loadNext(f.gun.uid, f.time())).toBeUndefined();
  f.mechanics.cancelLoad(f.gun.uid);
  expect(f.lesson()).toBe('partial');
  f.load(); // one round
  f.close();
  expect(f.lesson()).toBe('ready');
  expect(f.pull()).toBe(true);
  expect(f.lesson()).toBe('ready');
  f.mechanics.cancelLoad(f.gun.uid);
  expect(f.lesson()).toBe('ready');
  expect(f.pull()).toBe(true);
  expect(f.lesson()).toBe('ready');
  f.finish();
  expect(f.lesson()).toBe('reload');
  f.load(); // open
  f.load(); // eject case
  f.load(); // replace round
  f.load(); // reserve live round for unloading
  f.close();
  expect(f.lesson()).toBe('reload');
  expect(f.pull(true)).toBe(true);
  f.finish();
  expect(f.lesson()).toBe('unload');
  expect(f.mechanics.removeMagazine(f.gun.uid, f.time())).toBeUndefined();
  f.finish(); // open
  f.finish(); // eject
  expect(f.lesson()).toBeUndefined();
});

it('revolver case picking and full reloading do not replace completed partial-load closure', () => {
  const f = fixture('revolver');
  const cylinder = f.gun.firearm!.cylinder!;
  f.load();
  for (const _chamber of cylinder.chambers) {
    f.load();
  }
  f.close();
  expect(f.lesson()).toBe('partial');
  expect(f.pull()).toBe(true);
  f.finish();
  f.load();
  f.load();
  expect(cylinder.open).toBe(true);
  expect(f.lesson()).toBe('partial');
  f.mechanics.cancelLoad(f.gun.uid);
  f.load();
  f.close();
  expect(cylinder.chambers.every((chamber) => chamber.state === 'round')).toBe(true);
  expect(f.lesson()).toBe('partial');
  expect(f.mechanics.removeMagazine(f.gun.uid, f.time())).toBeUndefined();
  f.finish();
  f.finish();
  f.close();
  expect(f.lesson()).toBe('partial');
  f.load();
  f.load();
  expect(cylinder.open).toBe(true);
  expect(f.lesson()).toBe('partial');
  f.mechanics.releaseLoad(f.gun.uid, f.time());
  expect(f.lesson()).toBe('partial');
  f.finish();
  expect(cylinder.open).toBe(false);
  expect(f.lesson()).toBe('reload');
});

it('pump requires completed chambering, a post-fire reload and discharge, and live-round ejection', () => {
  const f = fixture('pump');
  expect(f.lesson()).toBe('partial');
  expect(f.mechanics.loadNext(f.gun.uid, f.time())).toBeUndefined();
  f.mechanics.cancelLoad(f.gun.uid);
  expect(f.lesson()).toBe('partial');
  f.load();
  f.close();
  expect(f.lesson()).toBe('partial'); // a loaded tube is not a chambered shell
  expect(f.pull()).toBe(false);
  expect(f.lesson()).toBe('partial');
  f.rack();
  expect(f.lesson()).toBe('ready');
  expect(f.pull()).toBe(true);
  expect(f.lesson()).toBe('reload');
  expect(f.pull(true)).toBe(false); // spent chamber cannot fire
  f.load();
  f.load();
  f.rack();
  expect(f.lesson()).toBe('reload');
  expect(f.pull(true)).toBe(true);
  expect(f.lesson()).toBe('unload');
  f.rack(); // eject hull, feed live shell
  expect(f.lesson()).toBe('unload');
  f.rack(); // eject live shell
  expect(f.lesson()).toBeUndefined();
});

it('does not splice another gun instance into a completed shooting sequence', () => {
  const f = fixture('pump');
  f.load();
  f.rack();
  expect(f.pull()).toBe(true);
  const other = f.inventory.create('practice-gun');
  f.observer.discharged(other, true, f.registry);
  f.observer.handling(other, 'load', f.registry);
  expect(f.lesson()).toBe('reload');
  expect(f.observer.lesson('revolver')).toBe('unpack');
});
