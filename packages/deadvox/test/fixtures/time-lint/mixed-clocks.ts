import type { GameSeconds, SimSeconds } from '../../../src/core/time.ts';

const mixed = (simDuration: SimSeconds, gameDuration: GameSeconds): number => simDuration + gameDuration;

export { mixed };
