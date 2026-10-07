import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRegistry, type Registry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { HandlingQueue } from '../src/core/handling.ts';
import { Inventory } from '../src/core/inventory.ts';
import type { Item } from '../src/core/items.ts';
import { type PelletShot, projectileShot } from '../src/core/pellets.ts';
import { makeScale } from '../src/core/scale.ts';
import type { ItemDef } from '../src/core/schema.ts';
import { World } from '../src/core/world.ts';
import { ZOMBIE_REGION_NAMES, type ZombieRegion, type ZombieRegions } from '../src/core/zombieRegions.ts';
import { FirearmMechanics, type FirearmShotInput, type FirearmTrajectory } from '../src/game/firearmHandling.ts';
import { PLAYER } from '../src/game/player.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { chargedRifle, rifleAmmunition } from './rifleFixture.ts';

const BASE = 'src/content/base';
const { registry } = buildRegistry(
  readdirSync(BASE)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({ source: file, data: JSON.parse(readFileSync(join(BASE, file), 'utf8')) as unknown })),
);
const RIFLES = ['rifle_assault', 'rifle_ak'] as const;
const BLOCK = 0.5;

/** Aimed down the sights, so the round flies along the view: straight ahead (-z) at eye height. */
const shotInput = (item: Item): FirearmShotInput => ({
  item,
  seed: 71,
  simTime: 1,
  feet: [0, 0, 0],
  eye: [0, PLAYER.eye / BLOCK, 0],
  yaw: 0,
  pitch: 0,
  aimFrame: { yaw: 0, pitch: 0 },
  blockSize: BLOCK,
  ready: true,
  sprinting: false,
  aimingDownSights: true,
});

const runtime = (onTrajectory?: (trajectory: FirearmTrajectory) => void) =>
  createSession({
    registry,
    world: new World(),
    isSolid: (_x, y) => y < 0,
    isOpaque: () => false,
    scale: makeScale(BLOCK),
    seed: 71,
    start: 0,
    spawn: [0, 0, 0],
    ready: () => true,
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
    ...(onTrajectory ? { onFirearmTrajectory: onTrajectory } : {}),
  });

type AmmoData = NonNullable<ItemDef['ammo']>;

/** Region health a projectile should take: the cartridge's damage, scaled on the head, less the region's resistance. */
const expectedLoss = (ammo: AmmoData, region: ZombieRegion, before: ZombieRegions): number => {
  const shambler = registry.zombies.get('shambler')!;
  const scale = region === 'head' ? (ammo.headDamageMultiplier ?? 1) : 1;
  const resistance = shambler.meleeDamageResistance?.[region].pierce ?? 0;
  return Math.min(before[region], ammo.damage * scale * (1 - resistance));
};

const changedRegions = (before: ZombieRegions, after: ZombieRegions): ZombieRegion[] =>
  ZOMBIE_REGION_NAMES.filter((region) => after[region] !== before[region]);

describe('rifle hits', () => {
  it('fires one projectile with its chambered cartridge’s ammo data, for each rifle calibre', () => {
    for (const type of RIFLES) {
      const { cartridge } = rifleAmmunition(registry, type);
      const ammo = registry.items.get(cartridge)!.ammo!;
      // Content unlike any built-in number, so the shot can only match it by reading the cartridge.
      const changed: Registry = { ...registry, items: new Map(registry.items) };
      changed.items.set(cartridge, {
        ...registry.items.get(cartridge)!,
        ammo: { ...ammo, damage: ammo.damage * 2, impulse: ammo.impulse * 3, rangeMetres: ammo.rangeMetres / 2 },
      });
      const inventory = new Inventory(changed);
      const queue = new HandlingQueue(inventory);
      const shots: PelletShot[] = [];
      const pose = shotInput(inventory.create(type));
      const mechanics = new FirearmMechanics(inventory, queue, {
        blockSize: BLOCK,
        pose: () => pose,
        onEjection: () => undefined,
        onShot: (shot) => shots.push(shot),
      });
      const { rifle } = chargedRifle(inventory, queue, mechanics, { type, rounds: 1 });
      expect(mechanics.fire({ ...shotInput(rifle) })).toBe(true);
      const loaded = changed.items.get(cartridge)!.ammo!;
      expect(shots).toEqual([
        expect.objectContaining({
          directions: [expect.any(Array)],
          damage: loaded.damage,
          impulse: loaded.impulse,
          rangeMetres: loaded.rangeMetres,
          diameterMm: loaded.diameterMm,
          headDamageMultiplier: loaded.headDamageMultiplier,
        }),
      ]);
    }
  });

  it('damages exactly the posed region a projectile’s ray crosses, scaled on the head', () => {
    const shambler = registry.zombies.get('shambler')!;
    /** A fresh standing shambler at `x`, shot along -z from `height`; returns the region the ray crosses, if any. */
    const strike = (session: ReturnType<typeof runtime>, ammo: AmmoData, x: number, height: number) => {
      const origin: Vec3 = [x, height, 0];
      const direction: Vec3 = [0, 0, -1];
      const zombie = session.zombieStore.get(session.zombies.add(shambler, [x, 0, -8]))!;
      const region = session.zombies.aimAt(origin, direction, {
        damage: 0,
        reach: ammo.rangeMetres,
        cooldown: 0,
      })?.region;
      const before = { ...zombie.regions };
      expect(session.zombies.firePellets(projectileShot(ammo, origin, [direction]))).toBe(region ? 1 : 0);
      expect(changedRegions(before, zombie.regions)).toEqual(region ? [region] : []);
      if (region) {
        expect(before[region] - zombie.regions[region]).toBeCloseTo(expectedLoss(ammo, region, before));
      }
      return region;
    };
    for (const type of RIFLES) {
      const ammo = registry.items.get(rifleAmmunition(registry, type).cartridge)!.ammo!;
      const session = runtime();
      // One shambler per ray height, far enough apart that no ray passes another.
      const struck = new Set(
        Array.from({ length: 10 }, (_, row) => strike(session, ammo, row * 6, 0.2 + row * 0.4)).filter(
          (region) => region !== undefined,
        ),
      );
      expect(struck.has('head') && struck.size > 1).toBe(true);
    }
  });

  it('a session rifle shot damages the shambler in its line of fire by its cartridge’s data', () => {
    for (const type of RIFLES) {
      const session = runtime();
      const { rifle } = chargedRifle(session.inventory, session.queue, session.firearms, {
        type,
        rounds: 1,
        magazines: session.magazines,
      });
      const ammo = registry.items.get(rifle.firearm!.roundType!)!.ammo!;
      const zombie = session.zombieStore.get(session.zombies.add(registry.zombies.get('shambler')!, [0, 0, -6]))!;
      const before = { ...zombie.regions };
      expect(session.firearms.fire(shotInput(rifle))).toBe(true);
      const [region, ...others] = changedRegions(before, zombie.regions);
      expect([region !== undefined, others]).toEqual([true, []]);
      expect(before[region!] - zombie.regions[region!]).toBeCloseTo(expectedLoss(ammo, region!, before));
    }
  });

  it('a presentation hook that rewrites the shot trajectory leaves the damage unchanged', () => {
    const damageWith = (onTrajectory?: (trajectory: FirearmTrajectory) => void): ZombieRegions => {
      const session = runtime(onTrajectory);
      const { rifle } = chargedRifle(session.inventory, session.queue, session.firearms, {
        rounds: 1,
        magazines: session.magazines,
      });
      const zombie = session.zombieStore.get(session.zombies.add(registry.zombies.get('shambler')!, [0, 0, -6]))!;
      const before = { ...zombie.regions };
      expect(session.firearms.fire(shotInput(rifle))).toBe(true);
      expect(changedRegions(before, zombie.regions)).toHaveLength(1);
      return { ...zombie.regions };
    };
    const scrambled = damageWith(({ directions }) => {
      for (const direction of directions) {
        (direction as number[]).splice(0, 3, 0, 1, 0);
      }
    });
    expect(scrambled).toEqual(damageWith());
  });
});
