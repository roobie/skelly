// biome-ignore-all lint/correctness/noUndeclaredDependencies: @mobgen/* resolves to sibling source through this package's Vite and TypeScript aliases.
import { fusedMassTemplate } from '@mobgen/mob/fusedMassTemplate.ts';
import { templateFigure } from '@mobgen/mob/humanoidFigure.ts';
import { TEMPLATES } from '@mobgen/mob/templates.ts';
import { describe, expect, it } from 'vitest';
import { bodyPlanModel, FIGURE_VARIANTS } from '../src/core/actorModels.ts';
import { validateContent } from '../src/core/content.ts';
import { FUSED_MASS_FIGURE_SEED, fusedMassFigureForType, fusedMassTypeOf } from '../src/core/fusedMassFigure.ts';
import { baseRegistry } from './baseRegistry.ts';

const registry = baseRegistry();
// A seed every shipped humanoid template generates valid on the first try.
const FIXTURE_SEED = 1;

describe('actor models', () => {
  it('lets content select every ready mobgen zombie template the renderer draws', () => {
    const [row] = registry.actors.values();
    // The acid is built, not generated, so it joins by its figure variant's model.
    const models = [
      ...[...TEMPLATES, fusedMassTemplate]
        .filter((template) => (template.status ?? 'ready') === 'ready')
        .map(({ name }) => name),
      FIGURE_VARIANTS.acid.model,
    ];
    const refused = models.filter((name) =>
      validateContent({
        source: 'body-plan.json',
        data: {
          actors: [
            {
              ...row,
              model: Object.values(FIGURE_VARIANTS).find((variant) => variant.model === name)?.bodyPlan,
              figure: Object.entries(FIGURE_VARIANTS).find(([, variant]) => variant.model === name)?.[0],
            },
          ],
        },
      }).some(({ path }) => path.endsWith('.model')),
    );
    expect(refused).toEqual([]);
  });

  it('realizes the simulation figure of every generated model content can select', () => {
    const amalgam = fusedMassTypeOf(registry.actors)!;
    for (const [model, { bodyPlan }] of Object.entries(FIGURE_VARIANTS)) {
      if (bodyPlan === 'acid') {
        continue;
      }
      const realize = () =>
        model === 'fused-mass'
          ? fusedMassFigureForType(amalgam, FUSED_MASS_FIGURE_SEED)
          : templateFigure(bodyPlanModel(model), FIXTURE_SEED);
      expect(realize, model).not.toThrow();
    }
  });
});
