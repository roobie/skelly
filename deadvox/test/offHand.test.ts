import { describe, expect, it } from 'vitest';
import { Character, dominantSide, offSide } from '../src/core/character.ts';
import { buildRegistry } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { offHandUse } from '../src/core/lights.ts';

const { registry, issues } = buildRegistry([
  {
    source: 'off-hand-fixture',
    data: {
      items: [
        {
          id: 'fixture_light',
          name: 'Light',
          category: 'tool',
          size: [1, 1],
          weight: 1,
          light: { radius: 1, seenFrom: 1 },
        },
        { id: 'fixture_plain', name: 'Tool', category: 'tool', size: [1, 1], weight: 1 },
      ],
    },
  },
]);
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}

describe('offHandUse', () => {
  it.each(['right', 'left'] as const)(
    '%s characters choose their off light even when the dominant slot also holds a light',
    (handedness) => {
      const character = new Character(registry, { handedness });
      const inventory = new Inventory(registry, undefined, undefined, character);
      const dominant = inventory.create('fixture_light');
      const secondary = inventory.create('fixture_light');
      expect(inventory.add(dominant, { kind: 'hand', side: dominantSide(character) })).toBe(true);
      expect(inventory.add(secondary, { kind: 'hand', side: offSide(character) })).toBe(true);
      expect(offHandUse(registry, inventory)).toBe(secondary);
    },
  );

  it('ignores an empty off hand, a dominant-only light, and an off item with no instant use', () => {
    const inventory = new Inventory(registry);
    expect(offHandUse(registry, inventory)).toBeUndefined();
    expect(
      inventory.add(inventory.create('fixture_light'), { kind: 'hand', side: dominantSide(inventory.character) }),
    ).toBe(true);
    expect(offHandUse(registry, inventory)).toBeUndefined();
    expect(inventory.add(inventory.create('fixture_plain'), { kind: 'hand', side: offSide(inventory.character) })).toBe(
      true,
    );
    expect(offHandUse(registry, inventory)).toBeUndefined();
  });
});
