import { describe, expect, it } from 'vitest';
import type { RecipeDef } from '../src/core/content.ts';
import type { FurnitureDef } from '../src/core/schema.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();

type Station = NonNullable<FurnitureDef['workstation']>;

const meets = (recipe: RecipeDef, level: (quality: string) => number): boolean =>
  Object.entries(recipe.qualities).every(([quality, required]) => level(quality) >= required);

// Validate checks that recipes name real stations and qualities, not that a dulled blade has somewhere to go.
describe('blade sharpening content', () => {
  it('restores every wearing blade at a placed station, and less with a tool found as loot', () => {
    const placed: Station[] = [...registry.templates.values()].flatMap((template) =>
      Object.values(template.palette).flatMap((entry) => {
        const station =
          typeof entry === 'object' && entry.furniture !== undefined
            ? registry.furniture.get(entry.furniture)?.workstation
            : undefined;
        return station ? [station] : [];
      }),
    );
    const lootTools = new Set(
      [...registry.loot.values()].flatMap((table) => table.entries.flatMap((entry) => entry.item ?? [])),
    );
    const fieldLevel = (quality: string) =>
      Math.max(0, ...[...lootTools].map((id) => registry.items.get(id)?.tool?.qualities[quality] ?? 0));
    const blades = [...registry.items.values()].filter(
      (item) => item.weapon?.melee?.type === 'cut' && item.weapon.melee.wearPerHit !== undefined,
    );
    expect(blades.length).toBeGreaterThan(0);
    for (const blade of blades) {
      const repairs = [...registry.recipes.values()].filter(
        (recipe) => recipe.kind === 'repair' && recipe.result.item === blade.id,
      );
      const atStation = repairs.filter((recipe) =>
        placed.some((station) => station.id === recipe.workstation && meets(recipe, (q) => station.qualities[q] ?? 0)),
      );
      const inField = repairs.filter((recipe) => !recipe.workstation && meets(recipe, fieldLevel));
      expect(atStation, blade.id).not.toHaveLength(0);
      expect(inField, blade.id).not.toHaveLength(0);
      const best = (found: RecipeDef[]) => Math.max(...found.map((recipe) => recipe.repair!.amount));
      expect(best(atStation), blade.id).toBeGreaterThan(best(inField));
    }
  });
});
