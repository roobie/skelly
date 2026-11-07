import { BURN_RESULT, liquidCraftData, QUALITY, RESULT, STOCK } from './liquidCraftFixture.ts';

export const RECOVERY_ROLE = 'crafting';
export const SALVAGE_ROLE = 'mechanics';
export const recoveryFraction = () => ({
  fractions: [0.25, 1],
  rounding: 'floor' as const,
  toolModifier: { quality: QUALITY, bonusByLevel: [0.25, 0.5] },
});
export const liquidRecoveryData = (timeGameMinutes = 1) => {
  const data = liquidCraftData();
  return {
    ...data,
    recipes: data.recipes.map((recipe) => ({ ...recipe, result: { ...recipe.result, count: 1 } })),
    items: data.items.map((item) =>
      item.id === RESULT || item.id === BURN_RESULT
        ? {
            ...item,
            disassembly: {
              skill: RECOVERY_ROLE,
              timeGameMinutes,
              yields: [{ item: STOCK, count: 1, ...recoveryFraction() }],
              liquidRecovery: recoveryFraction(),
            },
            salvage: [{ item: STOCK, count: 1 }],
            salvageTimeGameMinutes: timeGameMinutes,
            salvageLiquidRecovery: { skill: SALVAGE_ROLE, ...recoveryFraction() },
          }
        : item,
    ),
  };
};
