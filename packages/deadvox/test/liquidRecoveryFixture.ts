import { BURN_RESULT, liquidCraftData, QUALITY, RESULT, STOCK } from './liquidCraftFixture.ts';

export const RECOVERY_SKILL = 'fixture_recovery';
export const SALVAGE_SKILL = 'fixture_salvage';
export const recoveryFraction = () => ({
  fractions: [0.25, 1],
  rounding: 'floor' as const,
  toolModifier: { quality: QUALITY, bonusByLevel: [0.25, 0.5] },
});
export const liquidRecoveryData = () => {
  const data = liquidCraftData();
  return {
    ...data,
    recipes: data.recipes.map((recipe) => ({ ...recipe, result: { ...recipe.result, count: 1 } })),
    skills: [
      { id: RECOVERY_SKILL, name: 'Fixture recovery' },
      { id: SALVAGE_SKILL, name: 'Fixture salvage' },
    ],
    items: data.items.map((item) =>
      item.id === RESULT || item.id === BURN_RESULT
        ? {
            ...item,
            disassembly: {
              skill: RECOVERY_SKILL,
              timeGameMinutes: 1,
              yields: [{ item: STOCK, count: 1, ...recoveryFraction() }],
              liquidRecovery: recoveryFraction(),
            },
            salvage: [{ item: STOCK, count: 1 }],
            salvageTimeGameMinutes: 1,
            salvageLiquidRecovery: { skill: SALVAGE_SKILL, ...recoveryFraction() },
          }
        : item,
    ),
  };
};
