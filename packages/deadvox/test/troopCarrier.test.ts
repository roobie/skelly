import { sizeFits } from '@skelly/engine/internal/core/items.ts';
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
  const grain = fitting('belly').lattice!.grain;
  const [rear, seat] = [fitting('rear'), fitting('driver_seat')];
  // Every box the route meets: its top is the floor itself or lower, and its bottom above a crouched player.
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
  // The compartment's racks, locker and bin.
  const Stowage = ['apc_rifle_rack', 'apc_ammo_rack', 'apc_wall_locker', 'apc_stowage_bin'];

  const stocked = () => {
    const inventory = new Inventory(registry);
    const vehicleId = inventory.registerVehicle({
      blueprint: BLUEPRINT,
      placementKey: 'fixture.apc',
      origin: [0, 0, 0],
      facing: 'n',
    });
    const fittings = inventory.vehicles.get(vehicleId)!.fittings;
    const part = (type: string): Item => fittings.find(({ item }) => item.type === type)!.item;
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
    return { inventory, fittings, part, loose, into };
  };

  it('gives each rack, locker and bin fitted its own pocket', () => {
    const { fittings } = stocked();
    const storage = fittings.filter(({ item }) => Stowage.includes(item.type));
    expect(new Set(storage.map(({ item }) => item.type))).toEqual(new Set(Stowage));
    expect(storage.filter(({ item }) => !registry.items.get(item.type)!.container).map(({ id }) => id)).toEqual([]);
    expect(new Set(storage.map(({ item }) => item.uid)).size).toBe(storage.length);
  });

  it('holds a full rifle rack and racked ammunition at once, each only in its own rack', () => {
    const { inventory, part, loose, into } = stocked();
    const [rack, ammoRack] = [part('apc_rifle_rack'), part('apc_ammo_rack')];
    const slots = registry.items.get(rack.type)!.container!.maxCount!;
    expect(firearms.length).toBeGreaterThan(0);
    const guns = Array.from({ length: slots }, (_, n) => loose(firearms[n % firearms.length]!.id));
    for (const gun of guns) {
      expect(inventory.move(gun, into(rack)).ok).toBe(true);
    }
    const round = loose(ammunition[0]!.id);
    expect(inventory.move(round, into(ammoRack)).ok).toBe(true);

    const contents = (owner: Item) => owner.pockets![0]!.map(({ item }) => item);
    expect(contents(rack)).toEqual(guns);
    expect(contents(ammoRack)).toEqual([round]);
    // One slot a gun: the next is refused once every slot is taken.
    expect(inventory.move(loose(firearms[0]!.id), into(rack)).ok).toBe(false);
    // Each rack takes only its own kind: even the smallest gun, which its grid has room for, stays out of the ammo rack.
    const [smallest] = [...firearms].sort((a, b) => a.size[0] * a.size[1] - b.size[0] * b.size[1]);
    const [w, h] = registry.items.get(ammoRack.type)!.container!.pockets[0]!.grid!;
    expect(sizeFits(smallest!.size, { w, h })).toBe(true);
    expect(inventory.move(loose(smallest!.id), into(ammoRack)).ok).toBe(false);
    expect(inventory.move(loose(ammunition[0]!.id), into(part('apc_wall_locker'))).ok).toBe(true);
  });

  it('refuses ammunition in the rifle rack', () => {
    const { inventory, part, loose, into } = stocked();
    expect(inventory.move(loose(ammunition[0]!.id), into(part('apc_rifle_rack'))).ok).toBe(false);
  });
});
