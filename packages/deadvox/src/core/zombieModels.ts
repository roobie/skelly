/** The zombie models content may select: each is a mobgen figure that `zombieFigure` realizes and the
 * actor renderer draws, so the schema, the realization boundary and the renderer share one list. */
export const ZOMBIE_MODELS = ['shambler', 'runner', 'crawler', 'brute', 'acid', 'amalgam'] as const;

export type ZombieModel = (typeof ZOMBIE_MODELS)[number];
