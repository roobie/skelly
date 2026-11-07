// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen/* resolves to sibling source through this package's Vite and TypeScript aliases.
import { acidTemplate } from '@mobgen/mob/acidTemplate.ts';
import { fusedMassTemplate } from '@mobgen/mob/fusedMassTemplate.ts';
import { TEMPLATES } from '@mobgen/mob/templates.ts';
import { describe, expect, it } from 'vitest';
import { actorFigure, fusedMassTypeOf } from '../src/core/actorFigure.ts';
import { FIGURE_VARIANTS } from '../src/core/actorModels.ts';
import { validateContent } from '../src/core/content.ts';
import { FUSED_MASS_FIGURE_SEED } from '../src/core/fusedMassFigure.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
// A seed every shipped humanoid template generates valid on the first try.
const FIXTURE_SEED = 1;

describe('actor models', () => {
  it('lets content select every ready mobgen zombie template the renderer draws', () => {
    const [row] = registry.actors.values();
    const refused = [...TEMPLATES, acidTemplate, fusedMassTemplate]
      .filter((template) => (template.status ?? 'ready') === 'ready')
      .filter((template) =>
        validateContent({
          source: 'body-plan.json',
          data: {
            actors: [
              {
                ...row,
                model: Object.values(FIGURE_VARIANTS).find((variant) => variant.model === template.name)?.bodyPlan,
                figure: Object.entries(FIGURE_VARIANTS).find(([, variant]) => variant.model === template.name)?.[0],
              },
            ],
          },
        }).some(({ path }) => path.endsWith('.model')),
      )
      .map(({ name }) => name);
    expect(refused).toEqual([]);
  });

  it('realizes a figure for every model content can select', () => {
    const amalgam = fusedMassTypeOf(registry.actors)!;
    for (const model of Object.keys(FIGURE_VARIANTS)) {
      const [type, seed] = model === 'fused-mass' ? [amalgam, FUSED_MASS_FIGURE_SEED] : [{ model }, FIXTURE_SEED];
      expect(() => actorFigure(type, seed), model).not.toThrow();
    }
  });
});
