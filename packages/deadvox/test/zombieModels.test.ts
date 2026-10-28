// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen/* resolves to sibling source through this package's Vite and TypeScript aliases.
import { acidTemplate } from '@mobgen/mob/acidTemplate.ts';
import { amalgamTemplate } from '@mobgen/mob/amalgamTemplate.ts';
import { TEMPLATES } from '@mobgen/mob/templates.ts';
import { describe, expect, it } from 'vitest';
import { AMALGAM_FIGURE_SEED } from '../src/core/amalgamFigure.ts';
import { validateContent } from '../src/core/content.ts';
import { amalgamTypeOf, zombieFigure } from '../src/core/zombieFigure.ts';
import { ZOMBIE_MODELS } from '../src/core/zombieModels.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
// A seed every shipped humanoid template generates valid on the first try.
const FIXTURE_SEED = 1;

describe('zombie models', () => {
  it('lets content select every ready mobgen zombie template the renderer draws', () => {
    const [row] = registry.zombies.values();
    const refused = [...TEMPLATES, acidTemplate, amalgamTemplate]
      .filter((template) => (template.status ?? 'ready') === 'ready')
      .filter((template) =>
        validateContent({ source: 'zombie-model.json', data: { zombies: [{ ...row, model: template.name }] } }).some(
          ({ path }) => path.endsWith('.model'),
        ),
      )
      .map(({ name }) => name);
    expect(refused).toEqual([]);
  });

  it('realizes a figure for every model content can select', () => {
    const amalgam = amalgamTypeOf(registry.zombies)!;
    for (const model of ZOMBIE_MODELS) {
      const [type, seed] = model === 'amalgam' ? [amalgam, AMALGAM_FIGURE_SEED] : [{ model }, FIXTURE_SEED];
      expect(() => zombieFigure(type, seed), model).not.toThrow();
    }
  });
});
