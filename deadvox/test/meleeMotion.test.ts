import { safeParse } from 'valibot';
import { expect, it } from 'vitest';
import { ContentFileSchema } from '../src/core/schema.ts';
import { baseRegistry } from './baseRegistry.ts';

it('requires motion on weapon attacks, the unarmed attack and zombie melee moves', () => {
  const registry = baseRegistry();
  const item = structuredClone(registry.items.get('kitchen_knife')!);
  const unarmed = structuredClone(registry.meleeClasses.get('fists')!);
  const zombie = structuredClone(registry.zombies.get('shambler')!);
  const cases: { pack: unknown; attack: Record<string, unknown> }[] = [
    { pack: { items: [item] }, attack: item.weapon!.melee },
    { pack: { meleeClasses: [unarmed] }, attack: unarmed.unarmed! },
    { pack: { zombies: [zombie] }, attack: zombie.attack.moves[0]! },
  ];
  for (const { pack, attack } of cases) {
    expect(safeParse(ContentFileSchema, pack).success).toBe(true);
    attack.motion = undefined;
    const invalid = safeParse(ContentFileSchema, pack);
    expect(invalid.success).toBe(false);
    expect(invalid.issues?.some((issue) => issue.path?.some((entry) => entry.key === 'motion'))).toBe(true);
  }
});
