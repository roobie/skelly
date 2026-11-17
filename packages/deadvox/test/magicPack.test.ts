import { buildRegistry, requiredContentIssues } from '@skelly/engine/content';
import { movableRefusal } from '@skelly/engine/internal/core/furnitureMove.ts';
import type { ContentPatch } from '@skelly/engine/internal/core/schema/files.ts';
import { meleeWeaponFromContent, resolvePlayerMeleeWeapon } from '@skelly/engine/internal/game/melee.ts';
import { Inventory } from '@skelly/engine/inventory';
import { admitPacks, selectFolderClosure } from '@skelly/engine/packs';
import { Character } from '@skelly/engine/sim';
import { describe, expect, it } from 'vitest';
import { readAvailablePacks } from '../tools/readBundledPacks.ts';

const RING = 'strength_ring';
const COMPATIBILITY = 'skelly.deadvox.magic';
const LIFT_LOOK = 'skelly.deadvox.scenario.with-magic.lift-look';
const MELEE_LOOK = 'skelly.deadvox.scenario.with-magic.melee-look';

// Both look packs stand on the with-magic scenario, so their closure is the magic stack plus the fixtures under test.
const admitted = admitPacks(selectFolderClosure([LIFT_LOOK, MELEE_LOOK], readAvailablePacks('.'), []));
const { registry, issues } = buildRegistry(admitted.sources);

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
const showroomPiece = (startId: string) =>
  registry.layouts.get(startOf(startId).site)!.showroom!.slots.at(-1)!.furniture;

describe('magic pack on the with-magic stack', () => {
  it('admits the magic closure and its look fixtures with no issues', () => {
    expect([...admitted.issues, ...issues, ...requiredContentIssues(registry)]).toEqual([]);
  });

  it('adds the ring to a Deadvox loot table through the compatibility patch', () => {
    const compatibility = admitted.packs.find(({ manifest }) => manifest.id === COMPATIBILITY)!;
    const patches = compatibility.files.flatMap(({ data }) => (data as { patches?: ContentPatch[] }).patches ?? []);
    const ringRows = patches.flatMap(({ id, add }) =>
      add.entries.filter(({ item }) => item === RING).map((row) => ({ id, row })),
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
});
