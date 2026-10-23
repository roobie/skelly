// The scheduler systems a save may name. The decoder refuses any other id before resolving saved references
// (`docs/decisions/0002-saves.md`); `test/saveSchedulerIds.test.ts` fails when a registered system is missing here.

export const KNOWN_SCHEDULER_IDS: ReadonlySet<string> = new Set([
  'damage-exposure',
  'needs',
  'body',
  'long-action',
  'lights',
  'power',
  'zombies',
  'zombie-background',
  'player',
  'handling',
  'firearms',
]);
