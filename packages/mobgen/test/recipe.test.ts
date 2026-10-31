import { describe, expect, it } from 'vitest';
import { build, generate, generateValid } from '../src/core/generate.ts';
import { checkRecipe, type RecipeStep } from '../src/core/recipe.ts';
import { registerTemplate, type Template } from '../src/core/template.ts';
import { RECIPE_TEMPLATES } from '../src/mob/recipeTemplates.ts';
import { shambler } from '../src/mob/templates.ts';

const fixture = (name: string, recipe: readonly RecipeStep[]): Template => {
  const template: Template = { ...shambler, name, base: shambler.name, status: 'comparison-only', recipe };
  checkRecipe(template);
  registerTemplate(template);
  return template;
};

const swell: RecipeStep = { id: 'gut', op: 'swell', bones: ['chest'], params: { factor: { min: 1, max: 2 } } };
const scatter: RecipeStep = {
  id: 'lumps',
  op: 'scatter',
  bones: ['chest'],
  material: 'skin',
  params: { count: { min: 1, max: 9 }, radius: { min: 0.02, max: 0.05 }, lift: { min: 0, max: 1 } },
};

describe('recipes', () => {
  it("keeps each step's rolls and the base body's rolls independent of the other steps", () => {
    const original = fixture('recipe-fixture-original', [swell, scatter]);
    // Insert a step ahead of both, and disable one: neither may move the remaining rolls.
    const edited = fixture('recipe-fixture-edited', [
      { ...scatter, id: 'inserted' },
      swell,
      { ...scatter, enabled: false },
    ]);
    for (const seed of [1, 2, 3]) {
      const before = generate(original, seed);
      const after = generate(edited, seed);
      const base = generate(shambler, seed);
      expect(after.params['gut.factor']).toBe(before.params['gut.factor']);
      expect(after.params['lumps.count']).toBeUndefined();
      expect(after.wounds).toEqual(base.wounds);
      for (const [name, value] of Object.entries(base.params)) {
        expect(before.params[name]).toBe(value);
      }
    }
  });

  it('grafts a renamed copy of the subtree under its new parent, keeping bones parents-first', () => {
    const template = fixture('recipe-fixture-graft', [
      {
        id: 'extra',
        op: 'graft',
        root: 'upperArm.L',
        parent: 'spine',
        prefix: 'extra.',
        params: { offsetX: 0, offsetY: -0.2, offsetZ: 0, rotateX: 0, rotateY: 0, rotateZ: 0, scale: 0.9 },
      },
    ]);
    const genome = generate(template, 4);
    const plain = build({ ...genome, template: shambler.name });
    const grafted = build(genome);

    const subtree = new Set(['upperArm.L']);
    for (const bone of plain.bones) {
      if (bone.parent !== null && subtree.has(bone.parent)) {
        subtree.add(bone.id);
      }
    }
    const added = grafted.bones.slice(plain.bones.length);
    expect(added.map((bone) => bone.id)).toEqual([...subtree].map((id) => `extra.${id}`));
    expect(added.find((bone) => bone.id === 'extra.upperArm.L')?.parent).toBe('spine');
    const seen = new Set<string>();
    for (const bone of grafted.bones) {
      expect(bone.parent === null || seen.has(bone.parent)).toBe(true);
      seen.add(bone.id);
    }
    const copiedFeatures = grafted.features.filter((feature) => feature.bone.startsWith('extra.'));
    expect(copiedFeatures.length).toBe(plain.features.filter((feature) => subtree.has(feature.bone)).length);
  });

  it('every recipe template yields an actor that passes validation', () => {
    expect(RECIPE_TEMPLATES.length).toBeGreaterThan(0);
    for (const template of RECIPE_TEMPLATES) {
      const valid = generateValid(template, 1, { maxAttempts: 10 });
      expect(valid?.realized.report.issues, template.name).toEqual([]);
    }
  });
});
