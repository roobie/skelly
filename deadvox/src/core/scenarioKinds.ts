/** The scenario kinds code can build. Keys only, so schema imports no site class; the site factories are keyed by it in `src/game/worldSetup.ts`. */
export const SCENARIO_KINDS = ['gauntlet'] as const;
export type ScenarioKind = (typeof SCENARIO_KINDS)[number];
