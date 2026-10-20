import { describe, expect, it } from 'vitest';
import { validateContent } from '../src/core/content.ts';
import { fixtureEconomy } from './economyFixtures.ts';

const validate = (wearable: unknown) =>
  validateContent({
    source: 'fixture.json',
    data: {
      items: [
        {
          id: 'fixture_helmet',
          name: 'Fixture helmet',
          category: 'clothing',
          weight: 1,
          size: [1, 1],
          economy: fixtureEconomy(),
          wearable,
        },
      ],
    },
  });
const viewModel = { model: 'fixture_view', tint: 0.1, darkening: 0.8 };

describe('wearable first-person metadata', () => {
  it('allows a view model only in front of the eyes', () => {
    expect(validate({ slot: 'head', encumbrance: 0, viewModel })).toEqual([]);
    expect(
      validate({ slot: 'torso', encumbrance: 0, viewModel }).some((issue) => issue.message.includes('head slot')),
    ).toBe(true);
  });

  it('requires both content strengths and bounds them as fractions', () => {
    for (const field of ['tint', 'darkening'] as const) {
      const missing: Partial<typeof viewModel> = { ...viewModel };
      delete missing[field];
      expect(
        validate({ slot: 'head', encumbrance: 0, viewModel: missing }).some((issue) => issue.path.includes(field)),
      ).toBe(true);
      for (const value of [-0.1, 1.1]) {
        expect(
          validate({ slot: 'head', encumbrance: 0, viewModel: { ...viewModel, [field]: value } }).some((issue) =>
            issue.path.includes(field),
          ),
        ).toBe(true);
      }
    }
  });
});
