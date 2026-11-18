import { loadVehicleBlueprint } from '@skelly/engine/internal/core/vehicleBlueprint.ts';
import { Inventory, type Item, type Target } from '@skelly/engine/inventory';
import type { ModelBox } from '@skelly/thing-core/schema';
import { describe, expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';
import { PLAYER } from './playerFixture.ts';

const registry = baseRegistry();
const BLUEPRINT = 'apc';

describe('the troop carrier’s compartment', () => {
  const apc = loadVehicleBlueprint(registry, BLUEPRINT);
  const fitting = (id: string) => apc.fittings.find((entry) => entry.id === id)!;
  const crouched = registry.player.get('player')!.crouch.bodyHeightMetres;
  const width = 2 * PLAYER.halfWidth;
  // The finest lattice the hull is drawn on, so the plan grid splits no collision box edge.
  const { grain } = fitting('belly').lattice!;
  const [rear, seat] = [fitting('rear'), fitting('driver_seat')];
  // The floor is the top of the belly under the compartment's centre.
  const floor = Math.max(
    ...fitting('belly')
      .collision.filter(({ min, max }) => min[0] <= 0 && max[0] >= 0 && min[2] <= 0 && max[2] >= 0)
      .map(({ max }) => max[1]),
  );
  const rearFace = Math.max(...rear.collision.map(({ max }) => max[2]));
  const seatRear = Math.min(...seat.collision.map(({ min }) => min[2]));

  /**
   * The front-most z a crouched player's square footprint reaches walking in plan from the rear opening, among
   * boxes that stand within the player's height above the floor; the ramp leaf, the closed opening, is left out.
   */
  const frontReached = (boxes: readonly ModelBox[]): number => {
    const inBand = boxes.filter(({ min, max }) => max[1] > floor && min[1] < floor + crouched);
    const xs = [Math.min(...inBand.map(({ min }) => min[0])), Math.max(...inBand.map(({ max }) => max[0]))] as const;
    const columns = Math.round((xs[1] - xs[0]) / grain);
    const rows = Math.round((seatRear - rearFace) / grain) + 1;
    const blocked = (i: number, k: number): boolean => {
      const [x0, z0] = [xs[0] + i * grain, rearFace + k * grain];
      return inBand.some(({ min, max }) => min[0] < x0 + grain && max[0] > x0 && min[2] < z0 + grain && max[2] > z0);
    };
    const cells = new Map<string, boolean>();
    const isBlocked = (i: number, k: number): boolean => {
      const key = `${i},${k}`;
      let found = cells.get(key);
      if (found === undefined) {
        found = blocked(i, k);
        cells.set(key, found);
      }
      return found;
    };
    const span = Math.ceil(width / grain);
    const fits = (i: number, k: number): boolean => {
      if (i < 0 || k < 0 || i + span > columns || k > rows) {
        return false;
      }
      for (let n = 0; n < span * span; n += 1) {
        if (isBlocked(i + (n % span), k + Math.floor(n / span))) {
          return false;
        }
      }
      return true;
    };
    const seen = new Set<string>();
    const queue: (readonly [number, number])[] = [];
    const visit = (i: number, k: number): void => {
      if (!seen.has(`${i},${k}`) && fits(i, k)) {
        seen.add(`${i},${k}`);
        queue.push([i, k]);
      }
    };
    for (let i = 0; i < columns; i += 1) {
      visit(i, 0);
    }
    for (const [i, k] of queue) {
      visit(i + 1, k);
      visit(i - 1, k);
      visit(i, k + 1);
      visit(i, k - 1);
    }
    return queue.length === 0
      ? Number.NEGATIVE_INFINITY
      : rearFace + (Math.max(...queue.map(([, k]) => k)) + span) * grain;
  };
  const fitted = apc.fittings.filter(({ id }) => id !== 'ramp').flatMap(({ collision }) => collision);

  it('leaves a crouched player a free path from the rear ramp opening to the driver’s station', () => {
    expect(frontReached(fitted)).toBeGreaterThanOrEqual(seatRear);
  });

  it('closes that path when a wall stands across the compartment', () => {
    const bulkhead: ModelBox = { min: [-2, floor, -1], max: [2, floor + crouched, -1 + grain] };
    expect(frontReached([...fitted, bulkhead])).toBeLessThan(seatRear);
  });
});

describe('the troop carrier’s stowage', () => {
  const defs = [...registry.items.values()];
  const firearms = defs.filter((def) => def.firearm !== undefined);
  const ammunition = defs.filter((def) => def.category === 'ammo');
  const holdsOnly = (owner: Item, kind: readonly { id: string }[]): boolean => {
    const { accepts } = registry.items.get(owner.type)!.container ?? {};
    return accepts?.every((id) => kind.some((def) => def.id === id)) === true;
  };
  // A gun and a cartridge of one test-owned size: any pocket that admits one has room for the other.
  const [gun, round] = [firearms[0]!, ammunition[0]!];
  const sameSize = {
    ...registry,
    items: new Map(registry.items).set(gun.id, { ...gun, size: [1, 1] }).set(round.id, { ...round, size: [1, 1] }),
  } as typeof registry;

  const stocked = (content = registry) => {
    const inventory = new Inventory(content);
    const vehicleId = inventory.registerVehicle({
      blueprint: BLUEPRINT,
      placementKey: 'fixture.apc',
      origin: [0, 0, 0],
      facing: 'n',
    });
    const { fittings } = inventory.vehicles.get(vehicleId)!;
    const rack = (kind: readonly { id: string }[]): Item => fittings.find(({ item }) => holdsOnly(item, kind))!.item;
    let piles = 0;
    const loose = (type: string): Item => {
      const item = inventory.create(type);
      piles += 1;
      if (!inventory.add(item, { kind: 'pile', pos: [4 + piles, 0, 4] })) {
        throw new Error(`Fixture ${type} did not land`);
      }
      return item;
    };
    const into = (owner: Item): Target => ({ kind: 'pocket', owner, pocket: 0 });
    return { inventory, fittings, rack, loose, into };
  };

  it('gives every fitted part with an authored container its own pockets', () => {
    const { fittings } = stocked();
    const storage = fittings.filter(({ item }) => registry.items.get(item.type)!.container);
    expect(storage.length).toBeGreaterThan(1);
    expect(new Set(storage.map(({ item }) => item.uid)).size).toBe(storage.length);
    expect(new Set(storage.map(({ item }) => item.pockets)).size).toBe(storage.length);
    for (const { item } of storage) {
      expect(item.pockets).toHaveLength(registry.items.get(item.type)!.container!.pockets.length);
    }
  });

  it('holds a full rifle rack and racked ammunition at once, each in its own rack', () => {
    const { inventory, rack, loose, into } = stocked();
    const [rifles, rounds] = [rack(firearms), rack(ammunition)];
    expect(rifles).not.toBe(rounds);
    const slots = registry.items.get(rifles.type)!.container!.maxCount!;
    const guns = Array.from({ length: slots }, (_, n) => loose(firearms[n % firearms.length]!.id));
    for (const each of guns) {
      expect(inventory.move(each, into(rifles)).ok).toBe(true);
    }
    const cartridge = loose(round.id);
    expect(inventory.move(cartridge, into(rounds)).ok).toBe(true);

    const contents = (owner: Item) => owner.pockets![0]!.map(({ item }) => item);
    expect(contents(rifles)).toEqual(guns);
    expect(contents(rounds)).toEqual([cartridge]);
    // One slot a gun: the next is refused once every slot is taken.
    expect(inventory.move(loose(gun.id), into(rifles)).ok).toBe(false);
  });

  it('keeps each rack to its own kind, whatever the item’s size', () => {
    const { inventory, rack, loose, into } = stocked(sameSize);
    const [rifles, rounds] = [rack(firearms), rack(ammunition)];
    // The cartridge going in shows the ammunition rack has room for the gun's size, so only its kind keeps the gun out.
    expect(inventory.move(loose(round.id), into(rounds)).ok).toBe(true);
    expect(inventory.move(loose(gun.id), into(rounds)).ok).toBe(false);
    expect(inventory.move(loose(gun.id), into(rifles)).ok).toBe(true);
    expect(inventory.move(loose(round.id), into(rifles)).ok).toBe(false);
  });
});
