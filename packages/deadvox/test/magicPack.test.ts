import { buildRegistry, type CastRuleEvent, requiredContentIssues, resolveCastRule } from '@skelly/engine/content';
import { movableRefusal } from '@skelly/engine/internal/core/furnitureMove.ts';
import type { ContentPatch } from '@skelly/engine/internal/core/schema/files.ts';
import type { StartDef } from '@skelly/engine/internal/core/schema/starts.ts';
import { meleeWeaponFromContent, resolvePlayerMeleeWeapon } from '@skelly/engine/internal/game/melee.ts';
import { Inventory } from '@skelly/engine/inventory';
import { admitPacks, selectFolderClosure } from '@skelly/engine/packs';
import { Character } from '@skelly/engine/sim';
import { describe, expect, it } from 'vitest';
import { readAvailablePacks } from '../tools/readBundledPacks.ts';
import { baseRegistry } from './baseRegistry.ts';

const RING = 'strength_ring';
const COMPATIBILITY = 'skelly.deadvox.magic';
const LIFT_LOOK = 'skelly.deadvox.scenario.with-magic.lift-look';
const MELEE_LOOK = 'skelly.deadvox.scenario.with-magic.melee-look';
const MISSILE_LOW = 'skelly.deadvox.scenario.with-magic.missile-low';
const MISSILE_HIGH = 'skelly.deadvox.scenario.with-magic.missile-high';
const MISSILE_POINT_BLANK = 'skelly.deadvox.scenario.with-magic.missile-point-blank';
const MISSILE_LOOKS = [MISSILE_LOW, MISSILE_HIGH, MISSILE_POINT_BLANK];

const available = readAvailablePacks('.');
// Every look pack stands on the with-magic scenario, so their closure is the magic stack plus the fixtures under test.
const admitted = admitPacks(selectFolderClosure([LIFT_LOOK, MELEE_LOOK, ...MISSILE_LOOKS], available, []));
const { registry, issues } = buildRegistry(admitted.sources);
const defaultStartId = admitted.packs.find(({ manifest }) => manifest.product)!.manifest.defaultStart!;

const wearer = () => {
  let inventory!: Inventory;
  const character = new Character(registry, { handedness: 'right', modifierSource: () => inventory.itemModifiers() });
  inventory = new Inventory(registry, undefined, undefined, character);
  const putOnRing = () => {
    const ring = inventory.create(RING);
    if (!inventory.add(ring, { kind: 'worn' })) {
      throw new Error('Could not wear the ring');
    }
  };
  return { inventory, character, putOnRing };
};

const startOf = (id: string) => registry.starts.get(id)!;
const ownStartOf = (pack: string) => {
  const [start] = admitted.packs
    .find(({ manifest }) => manifest.id === pack)!
    .files.flatMap(({ data }) => (data as { starts?: StartDef[] }).starts ?? []);
  return startOf(start!.id);
};
const showroomPiece = (startId: string) =>
  registry.layouts.get(startOf(startId).site)!.showroom!.slots.at(-1)!.furniture;

describe('magic pack on the with-magic stack', () => {
  it('admits the magic closure and its look fixtures with no issues', () => {
    expect([...admitted.issues, ...issues, ...requiredContentIssues(registry)]).toEqual([]);
  });

  it('adds the ring to a Deadvox loot table through the compatibility patch', () => {
    const compatibility = admitted.packs.find(({ manifest }) => manifest.id === COMPATIBILITY)!;
    const patches = compatibility.files.flatMap(({ data }) => (data as { patches?: ContentPatch[] }).patches ?? []);
    const ringRows = patches.flatMap((patch) =>
      patch.section === 'loot'
        ? patch.add.entries.filter(({ item }) => item === RING).map((row) => ({ id: patch.id, row }))
        : [],
    );
    expect(ringRows).not.toEqual([]);
    for (const { id, row } of ringRows) {
      expect(registry.loot.get(id)!.entries).toContainEqual(row);
    }
  });

  it('refuses the lift fixture piece whole until the strength ring is worn', () => {
    const def = registry.furniture.get(showroomPiece('ringliftlook'))!;
    const { inventory, putOnRing } = wearer();
    const piece = inventory.furnish({ type: def.id, pos: [3, 1, 3], size: def.size, facing: 'n' })!;
    expect(movableRefusal(inventory, piece)).toBeDefined();
    putOnRing();
    expect(movableRefusal(inventory, piece)).toBeUndefined();
  });

  it('resolves a stronger melee impulse from the melee fixture weapon with the ring worn', () => {
    const held = startOf('ringmeleelook').kit.find(({ destination }) => destination.kind === 'hand')!;
    const melee = registry.items.get(held.item)!.weapon!.melee!;
    const meleeClass = registry.meleeClasses.get(melee.type!);
    const { character, putOnRing } = wearer();
    const impulse = () => resolvePlayerMeleeWeapon(meleeWeaponFromContent(melee), meleeClass, character, 1).impulse;
    const bare = impulse();
    putOnRing();
    expect(impulse()).toBeGreaterThan(bare);
  });

  it('hands the patched default start and every missile look a held focus, its spell and the pool it spends', () => {
    for (const start of [startOf(defaultStartId), ...MISSILE_LOOKS.map(ownStartOf)]) {
      const held = start.kit.filter(
        ({ item, destination }) => destination.kind === 'hand' && registry.items.get(item)!.casting,
      );
      expect(held, start.id).not.toEqual([]);
      for (const { item } of held) {
        const { ability } = registry.items.get(item)!.casting!;
        expect(
          start.abilities.map((row) => row.ability),
          start.id,
        ).toContain(ability);
        expect(
          start.pools.map((row) => row.pool),
          start.id,
        ).toContain(registry.abilities.get(ability)!.cost.pool);
      }
    }
  });

  it('resolves more missiles and more total damage at the high missile fixture than at the low one', () => {
    const volleyAt = (pack: string) => {
      const [known] = ownStartOf(pack).abilities;
      const ability = registry.abilities.get(known!.ability)!;
      const event: CastRuleEvent = {
        casterId: 'player',
        abilityId: ability.id,
        sourceItemUid: 1,
        hand: 'right',
        abilityLevel: known!.level,
        origin: { x: 0, y: 0, z: 0 },
        aim: { x: 1, y: 0, z: 0 },
      };
      const volleys = resolveCastRule(registry, ability.rule, event);
      return {
        count: volleys.reduce((sum, { count }) => sum + count, 0),
        damage: volleys.reduce((sum, { count, damage }) => sum + count * damage, 0),
      };
    };
    const low = volleyAt(MISSILE_LOW);
    const high = volleyAt(MISSILE_HIGH);
    expect(high.count).toBeGreaterThan(low.count);
    expect(high.damage).toBeGreaterThan(low.damage);
  });
});

describe('Deadvox without the with-magic scenario', () => {
  it('gives the default start no ability and no pool, even with the magic packs loaded', () => {
    const magic = admitPacks(selectFolderClosure([COMPATIBILITY], available, []));
    const stacks = [baseRegistry(), buildRegistry(magic.sources).registry];
    for (const stack of stacks) {
      const start = stack.starts.get(defaultStartId)!;
      expect({ abilities: start.abilities, pools: start.pools }).toEqual({ abilities: [], pools: [] });
    }
  });
});
