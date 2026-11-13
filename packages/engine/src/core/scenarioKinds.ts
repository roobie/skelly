/** The scenario kinds code can build. Keys only, so schema imports no site class; the site factories are keyed by it in `packages/engine/src/game/worldSetup.ts`. */
export const SCENARIO_KINDS = { assembledCity: 'assembledCity', composedSite: 'composedSite' } as const;
export type ScenarioKind = keyof typeof SCENARIO_KINDS;
