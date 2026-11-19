import { buildRegistry } from '@skelly/engine/content';
import { simTimestamp } from '@skelly/engine/internal/core/time.ts';
import { claimed, Inventory } from '@skelly/engine/inventory';
import { percentText } from '@skelly/engine/text';
import { BlockEntities, SitePower } from '@skelly/engine/world';
import { housingFaults, minimumWorkingText } from '@skelly/presentation/internal/ui/housingFaults.ts';
import { describe, expect, it } from 'vitest';
import inventoryContent from '../../mods/skelly.inventory/inventory.json' with { type: 'json' };
import content from '../mods/skelly.deadvox.scenario.test-house.plant-instruments-look/instruments.json' with {
  type: 'json',
};
import { baseRegistryWith } from './baseRegistry.ts';
import { BASE_CLOCK, BASE_DAY_CYCLE } from './dayPhaseFixture.ts';
import { FIXTURE_BLOW_SOUND, FIXTURE_MATERIAL, fixtureSources } from './economyFixtures.ts';

const fixture = () => {
  const registry = baseRegistryWith([{ source: 'instrument-fixture', data: content }]);
  const definition = [...registry.furniture.values()].find((entry) => entry.power?.instruments)!;
  const issues = () =>
    buildRegistry(
      fixtureSources([
        {
          source: 'instrument-admission-fixture',
          data: {
            ...content,
            ...inventoryContent,
            furniture: [
              {
                ...definition,
                material: FIXTURE_MATERIAL,
                moveSounds: { lift: FIXTURE_BLOW_SOUND, drag: FIXTURE_BLOW_SOUND },
              },
            ],
          },
        },
      ]),
    ).issues;
  return { registry, definition, issues };
};

describe('instrument content admission', () => {
  it.each([
    'no-required-slots',
    'incomplete-bands',
    'invalid-step',
    'crossing-sway',
    'unknown-slot',
    'invalid-symbol',
    'missing-tick',
    'overlapping-turn',
  ] as const)('rejects %s at the shared reference boundary', (invalid) => {
    const { definition, issues } = fixture();
    expect(issues()).toEqual([]);
    const power = definition.power!;
    const look = power.instruments!;
    const word = Object.keys(look.dial.bands)[0]!;
    switch (invalid) {
      case 'no-required-slots':
        power.requires = undefined;
        break;
      case 'incomplete-bands':
        look.dial.bands = Object.fromEntries(Object.entries(look.dial.bands).filter(([key]) => key !== word));
        break;
      case 'invalid-step':
        look.dial.bands[word] = look.dial.steps.length;
        break;
      case 'crossing-sway':
        look.dial.swayAmplitudeDegrees = look.dial.steps.at(-1)! - look.dial.steps[0]!;
        break;
      case 'unknown-slot':
        look.flags[0]!.slot = 'fixture_unknown_slot';
        break;
      case 'invalid-symbol':
        look.dial.symbols = { [look.dial.steps.length]: 'X' };
        break;
      case 'missing-tick':
        look.dial.tickBands = {};
        break;
      case 'overlapping-turn':
        look.dial.steps[look.dial.steps.length - 1] = look.dial.steps[0]! + 360;
        break;
      default:
        throw new Error('unknown fixture mutation');
    }
    expect(issues().length).toBeGreaterThan(0);
  });

  it('admits content-only zero sway and replacement tick symbols', () => {
    const { definition, issues } = fixture();
    definition.power!.instruments!.dial.swayAmplitudeDegrees = 0;
    definition.power!.instruments!.dial.symbols = { '0': '○' };
    expect(issues()).toEqual([]);
  });
});

it('RUN emission follows production and missing faults do not disclose irrelevant thresholds', () => {
  const { registry, definition } = fixture();
  const inventory = new Inventory(registry, undefined, new BlockEntities(registry, 1));
  const entity = inventory.furnishSpawn({
    spec: { type: definition.id, pos: [0, 1, 0], size: definition.size, facing: 'e' },
    loot: [],
  })!;
  const power = new SitePower({
    registry,
    inventory,
    clock: BASE_CLOCK,
    cycle: BASE_DAY_CYCLE,
    arrived: () => true,
    devices: [
      {
        type: definition.id,
        pos: entity.origin,
        entitySpec: { type: definition.id, pos: entity.origin, size: definition.size, facing: 'e' },
      },
    ],
  });
  inventory.entities.aroundPartsChange = (piece, change) => power.aroundChange(simTimestamp(0), piece, change);
  expect(power.instruments(entity)?.producing).toBe(true);
  expect(power.lights().length).toBeGreaterThan(0);
  const requirement = definition.power!.requires![0]!;
  const removed = inventory.housingTransfer({
    kind: 'remove',
    entityUid: entity.uid,
    slot: requirement.slot,
    output: { kind: 'pile', pos: [0, 1, 0] },
  });
  expect(removed).toBeUndefined();
  expect(power.lights()).toEqual([]);
  expect(housingFaults(registry, entity, power)).toEqual([
    {
      slot: requirement.slot,
      name: definition.power!.instruments!.flags.find((flag) => flag.slot === requirement.slot)!.name,
      label: claimed(registry.ui, 'interface')!.screenText.housingFault.absent,
      detail: undefined,
    },
  ]);
});

it('furnishes a retained ruined fixture without ruining or materialising its baseline internals', () => {
  const { registry, definition } = fixture();
  const inventory = new Inventory(registry, undefined, new BlockEntities(registry, 1));
  const spec = {
    type: definition.id,
    pos: [0, 1, 0] as [number, number, number],
    size: definition.size,
    facing: 'n' as const,
  };
  const before = inventory.entities.housingView({ type: definition.id, origin: spec.pos });
  expect(before.length).toBeGreaterThan(0);
  const { nextItemUid } = inventory.snapshotState();
  const entity = inventory.furnishSpawn({ spec, loot: [], wear: 1 })!;
  expect(inventory.entities.stands(entity)).toBe(true);
  expect(inventory.entities.conditionOf(entity)).toBe(0);
  expect(inventory.entities.housingView(entity)).toEqual(before);
  expect(inventory.snapshotState().nextItemUid).toBe(nextItemUid);
});

it('formats an authored minimum including zero, but never invents the omitted comparison fallback', () => {
  const { registry } = fixture();
  expect(minimumWorkingText(registry, undefined)).toBeUndefined();
  const text = claimed(registry.ui, 'interface')!.screenText.housingFault.minimum;
  expect(minimumWorkingText(registry, 0)).toBe(text.replace('{minimum}', percentText(0)));
});
