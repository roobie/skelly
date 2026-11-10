import { describe, expect, it } from 'vitest';
import type { MoveStart } from '../../engine/src/core/handling.ts';
import { vehicleCells } from '../../engine/src/core/vehicleProjection.ts';
import { Inventory } from '../../engine/src/inventory.ts';
import { World } from '../../engine/src/world.ts';
import { handlingMoveCompleteCue } from '../src/game/audioPresentation.ts';
import { baseRegistryWith } from './baseRegistry.ts';

import { buildFixtureRegistry } from './economyFixtures.ts';

const ids = { item: 'fixture_drop', part: 'fixture_part', family: 'fixture_character', material: 'fixture_surface' };
const fixture = () => {
  const registry = baseRegistryWith([]);
  const sound = [...registry.sounds.values()].find((event) => event.noise.enabled)!;
  const events = ['fixture_default', 'fixture_pair', 'fixture_furniture', 'fixture_vehicle'];
  const donor = [...registry.items.values()].find(
    (entry) => entry.vehicle && entry.model && !entry.vehicle.cargoSpace,
  )!;
  const part = {
    ...donor,
    id: ids.part,
    name: 'Fixture part',
    vehicle: { ...donor.vehicle!, drops: { default: events[3]! } },
  };
  const sources = [
    {
      source: 'fixture-receivers',
      data: {
        soundFamilies: [{ id: ids.family }],
        sounds: events.map((id) => ({ ...sound, id })),
        items: [
          {
            id: ids.item,
            name: 'Fixture drop',
            category: 'misc',
            weight: 1,
            size: [1, 1],
            workInProgress: false,
            soundsLike: ids.family,
          },
          part,
          {
            ...part,
            id: 'fixture_second_part',
            name: 'Second fixture part',
            vehicle: { ...part.vehicle, drops: { default: events[2]! } },
          },
        ],
        furnitureMaterials: [{ id: ids.material, blowSound: sound.id, drops: { default: events[2]! } }],
        furniture: [
          {
            id: 'fixture_crate',
            name: 'Fixture crate',
            size: [1, 1, 1],
            color: '#888888',
            material: ids.material,
            breach: { minimumStrength: 1, durability: 1 },
            massKg: 1,
          },
        ],
        vehicleBlueprints: [
          {
            id: 'fixture_car',
            name: 'Fixture car',
            fittings: [
              { id: 'fixture_bonnet', part: ids.part, at: [0, 0, 0], supportedBy: [] },
              { id: 'fixture_overlapping_part', part: 'fixture_second_part', at: [0, 0, 0], supportedBy: [] },
            ],
          },
        ],
      },
    },
  ];
  const admitted = baseRegistryWith(sources);
  const block = {
    ...admitted.blocks.find((entry) => entry.solid)!,
    id: 'fixture_block',
    drops: { default: events[0]!, [ids.family]: events[1]! },
  };
  const blockId = admitted.blocks.push(block) - 1;
  admitted.blockIds.set(block.id, blockId);
  const world = new World();
  const inventory = new Inventory(admitted);
  const item = inventory.create(ids.item);
  const context = {
    blockIdAt: (x: number, y: number, z: number) => world.getBlock(x, y, z),
    entities: inventory.entities,
    vehicles: inventory.vehicles,
    blockSize: 1,
  };
  const cue = (pos: [number, number, number]) =>
    handlingMoveCompleteCue(
      { item, from: { kind: 'hand', side: 'left' }, target: { kind: 'pile', pos } } as MoveStart,
      admitted,
      context,
    );
  const providers = [
    {
      source: 'fixture-providers',
      data: {
        sounds: [...admitted.sounds.values()],
        soundFamilies: [...admitted.soundFamilies.values()],
        models: [admitted.models.get(part.model!)!],
      },
    },
    ...sources,
  ];
  return { registry: admitted, inventory, item, world, block, blockId, cue, part, events, providers };
};

describe('pile drop receiver sounds', () => {
  it('pairs the item character with its block and uses that block default for missing or omitted characters', () => {
    const f = fixture();
    const pos: [number, number, number] = [0, 1, 0];
    f.world.setBlock(pos[0], pos[1] - 1, pos[2], f.blockId);
    expect(f.cue(pos)?.event).toBe(f.events[1]);
    f.registry.soundFamilies.set('constructor', { id: 'constructor' });
    f.registry.items.set(ids.item, { ...f.registry.items.get(ids.item)!, soundsLike: 'constructor' });
    expect(f.cue(pos)?.event).toBe(f.events[0]);
    const { soundsLike: _omitted, ...plain } = f.registry.items.get(ids.item)!;
    f.registry.items.set(ids.item, plain);
    expect(f.cue(pos)?.event).toBe(f.events[0]);
  });

  it('uses the solid furniture material, not terrain below it', () => {
    const f = fixture();
    const piece = f.inventory.furnish({ type: 'fixture_crate', pos: [0, 1, 0], size: [1, 1, 1], facing: 'n' })!;
    f.world.setBlock(
      ...(piece.pos.map((value, axis) => (axis === 1 ? value - 1 : value)) as [number, number, number]),
      f.blockId,
    );
    expect(f.cue([piece.pos[0], piece.pos[1] + piece.size[1], piece.pos[2]])?.event).toBe(f.events[2]);
  });

  it('uses the first authored receiving vehicle part in a shared air cell', () => {
    const f = fixture();
    f.inventory.registerVehicle({
      blueprint: 'fixture_car',
      placementKey: 'fixture-car',
      origin: [0, 10, 0],
      facing: 'n',
    });
    const cells = [...vehicleCells(f.registry, f.inventory.vehicles, 1)];
    expect(cells.length).toBeGreaterThan(0);
    const cell = cells.reduce((top, candidate) => (candidate[1] > top[1] ? candidate : top));
    expect(f.cue([cell[0], cell[1] + 1, cell[2]])?.event).toBe(f.events[3]);
  });

  it('validates item characters, receiver row keys and selected events at their authoring fields', () => {
    const f = fixture();
    const { issues } = buildFixtureRegistry([
      ...f.providers,
      {
        source: 'fixture-unknown-selection',
        data: {
          items: [{ ...f.registry.items.get(ids.item)!, soundsLike: 'fixture_absent' }],
          blocks: [
            {
              id: f.block.id,
              name: f.block.name,
              color: f.block.color,
              solid: true,
              drops: { default: f.events[0], [`${ids.family}_absent`]: 'fixture_missing_event' },
            },
          ],
        },
      },
    ]);
    expect(issues).toEqual(
      expect.arrayContaining([
        {
          source: 'fixture-unknown-selection',
          path: 'items[0].soundsLike',
          message: 'no sound family "fixture_absent"',
        },
        {
          source: 'fixture-unknown-selection',
          path: `blocks[0].drops.${ids.family}_absent`,
          message: `no sound family "${ids.family}_absent"`,
        },
        {
          source: 'fixture-unknown-selection',
          path: `blocks[0].drops.${ids.family}_absent`,
          message: 'no sound event "fixture_missing_event"',
        },
      ]),
    );
  });

  it.each(['blocks', 'furnitureMaterials', 'items'] as const)('rejects a missing any-item default on %s', (section) => {
    const f = fixture();
    const entries = {
      blocks: { id: f.block.id, name: f.block.name, color: f.block.color, solid: true, drops: {} },
      furnitureMaterials: { ...f.registry.furnitureMaterials.get(ids.material)!, drops: {} },
      items: { ...f.part, vehicle: { ...f.part.vehicle, drops: {} } },
    };
    const { issues } = buildFixtureRegistry([
      ...f.providers,
      { source: 'fixture-missing-default', data: { [section]: [entries[section]] } },
    ]);
    expect(issues).toEqual([
      {
        source: 'fixture-missing-default',
        path: `${section}[0].${section === 'items' ? 'vehicle.' : ''}drops.default`,
        message: 'missing any-item drop sound',
      },
    ]);
  });
});
