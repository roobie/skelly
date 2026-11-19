import { buildRegistry, type FurnitureDef } from '@skelly/engine/content';
import { simTimestamp } from '@skelly/engine/internal/core/time.ts';
import { claimed, housingBlueprint, Inventory } from '@skelly/engine/inventory';
import { percentText } from '@skelly/engine/text';
import { BlockEntities, SitePower } from '@skelly/engine/world';
import { type Depiction, PlantInstruments } from '@skelly/presentation/internal/render/plantInstruments.ts';
import { housingFaults, minimumWorkingText } from '@skelly/presentation/internal/ui/housingFaults.ts';
import { type BufferGeometry, Group, type Mesh, type MeshLambertMaterial, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import inventoryContent from '../../mods/skelly.inventory/inventory.json' with { type: 'json' };
import content from '../mods/skelly.deadvox.scenario.test-house.plant-instruments-look/instruments.json' with {
  type: 'json',
};
import { baseRegistryWith } from './baseRegistry.ts';
import { BASE_CLOCK, BASE_DAY_CYCLE } from './dayPhaseFixture.ts';
import { FIXTURE_BLOW_SOUND, FIXTURE_MATERIAL, fixtureSources } from './economyFixtures.ts';

type SlotAnchor = NonNullable<FurnitureDef['slotAnchors']>[number];

const fixture = () => {
  const registry = baseRegistryWith([{ source: 'instrument-fixture', data: content }]);
  const definition = registry.furniture.get(content.furniture[0]!.id)!;
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

  it.each([
    ['partial', 'furniture[0].slotAnchors'],
    ['duplicate', 'furniture[0].slotAnchors'],
    ['unknown', 'furniture[0].slotAnchors[2].slot'],
    ['unmounted-flag', 'furniture[0].slotAnchors[0].flagMount'],
  ] as const)('refuses %s slot anchors, since a housing with anchors places every slot once', (invalid, path) => {
    const { registry, definition, issues } = fixture();
    const { slots } = registry.partBlueprints.get(definition.takeApart!.parts!)!;
    const anchor = (slot: string): SlotAnchor => ({ slot, position: [0, 0, 0], pickSize: [1, 1, 1] });
    const anchors = slots.map(({ id }): SlotAnchor => ({ ...anchor(id), flagMount: { position: [0, 0, 0] } }));
    definition.slotAnchors = anchors;
    expect(issues()).toEqual([]);
    switch (invalid) {
      case 'partial':
        definition.slotAnchors = anchors.slice(1);
        break;
      case 'duplicate':
        definition.slotAnchors = [...anchors, anchors[0]!];
        break;
      case 'unknown':
        definition.slotAnchors = [...anchors, anchor('fixture_unknown_slot')];
        break;
      case 'unmounted-flag':
        definition.slotAnchors = [anchor(slots[0]!.id), ...anchors.slice(1)];
        break;
      default:
        throw new Error('unknown fixture mutation');
    }
    expect(issues().map((issue) => issue.path)).toEqual([path]);
  });

  it('admits content-only zero sway and replacement tick symbols', () => {
    const { definition, issues } = fixture();
    definition.power!.instruments!.dial.swayAmplitudeDegrees = 0;
    definition.power!.instruments!.dial.symbols = { '0': '○' };
    expect(issues()).toEqual([]);
  });
});

/** The fixture housing standing on its own bus, with the removal of the first part it requires. */
const powered = ({ registry, definition }: ReturnType<typeof fixture>) => {
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
  const requirement = definition.power!.requires![0]!;
  const removeRequired = () =>
    inventory.housingTransfer({
      kind: 'remove',
      entityUid: entity.uid,
      slot: requirement.slot,
      output: { kind: 'pile', pos: [0, 1, 0] },
    });
  return { inventory, entity, power, requirement, removeRequired };
};

it('RUN emission follows production and missing faults do not disclose irrelevant thresholds', () => {
  const staged = fixture();
  const { registry, definition } = staged;
  const { entity, power, requirement, removeRequired } = powered(staged);
  expect(power.instruments(entity)?.producing).toBe(true);
  expect(power.lights().length).toBeGreaterThan(0);
  expect(removeRequired()).toBeUndefined();
  expect(power.lights()).toEqual([]);
  expect(housingFaults(registry, entity, power)).toEqual([
    {
      slot: requirement.slot,
      name: housingBlueprint(registry, definition.id)!.slots.find(({ id }) => id === requirement.slot)!.name,
      label: claimed(registry.ui, 'interface')!.screenText.housingFault.absent,
      detail: undefined,
    },
  ]);
});

it('reports a housing fault by its blueprint slot name when the housing has no instruments look', () => {
  const staged = fixture();
  staged.definition.power!.instruments = undefined;
  const { entity, power, requirement, removeRequired } = powered(staged);
  expect(removeRequired()).toBeUndefined();
  expect(housingFaults(staged.registry, entity, power).map(({ slot, name }) => ({ slot, name }))).toEqual([
    {
      slot: requirement.slot,
      name: housingBlueprint(staged.registry, staged.definition.id)!.slots.find(({ id }) => id === requirement.slot)!
        .name,
    },
  ]);
});

it('depicts a housing away from the world with its instruments as the world last read them, kept as drawn', () => {
  const staged = fixture();
  // Labels paint on a canvas, which the unit run has none of; the depiction does not depend on them.
  staged.definition.power!.instruments!.labels = [];
  const { inventory, entity, power, requirement, removeRequired } = powered(staged);
  const instruments = new PlantInstruments(1, claimed(staged.registry.inventory, 'player')!.conditionBands);
  const sync = () => instruments.sync(inventory.entities, (housing) => power.instruments(housing), 0);
  const shown = (model: Object3D) => ({
    lit: (model.getObjectByName('run') as Mesh<BufferGeometry, MeshLambertMaterial>).material.emissiveIntensity > 0,
    pin: model.getObjectByName('pin')!.rotation.z,
    dropped: model.getObjectByName(`slot:${requirement.slot}:dropped`)!.visible,
  });
  const piece = new Group();
  const depictions: Depiction[] = [];
  const depict = () => {
    depictions.push(instruments.depicted(entity, piece));
    return depictions.at(-1)!.model;
  };
  try {
    sync();
    const running = depict();
    const drawn = shown(running);
    expect(running.children).toContain(piece);
    expect(drawn).toEqual(shown(instruments.group));
    expect(drawn.lit && !drawn.dropped, 'the fixture starts producing').toBe(true);

    expect(removeRequired()).toBeUndefined();
    sync();
    expect(shown(running), 'the world stopping leaves the drawn depiction as drawn').toEqual(drawn);
    const stopped = shown(depict());
    expect(stopped).toEqual(shown(instruments.group));
    expect(stopped.lit || !stopped.dropped, 'a later depiction reads the stop').toBe(false);
  } finally {
    for (const depiction of depictions) {
      depiction.dispose();
    }
    instruments.dispose();
  }
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
