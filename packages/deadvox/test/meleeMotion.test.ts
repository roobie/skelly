import { ContentFileSchema } from '@skelly/engine/internal/core/schema.ts';
import { safeParse } from 'valibot';
import { expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';

it('requires motion on weapon attacks, the unarmed attack and zombie melee moves', () => {
  const registry = baseRegistry();
  const item = structuredClone(registry.items.get('kitchen_knife')!);
  const unarmed = structuredClone(registry.meleeClasses.get('fists')!);
  const actor = structuredClone(registry.actors.get('shambler')!);
  const cases: { pack: unknown; attack: Record<string, unknown> }[] = [
    { pack: { items: [item] }, attack: item.weapon!.melee },
    { pack: { meleeClasses: [unarmed] }, attack: unarmed.unarmed! },
    { pack: { actors: [actor] }, attack: actor.attack!.moves[0]! },
  ];
  for (const { pack, attack } of cases) {
    expect(safeParse(ContentFileSchema, pack).success).toBe(true);
    attack.motion = undefined;
    const invalid = safeParse(ContentFileSchema, pack);
    expect(invalid.success).toBe(false);
    expect(invalid.issues?.some((issue) => issue.path?.some((entry) => entry.key === 'motion'))).toBe(true);
  }
});
