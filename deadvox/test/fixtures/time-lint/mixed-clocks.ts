import type { GameSeconds, SimSeconds } from '../../../src/core/time.ts';

declare const simDuration: SimSeconds;
declare const gameDuration: GameSeconds;
const mixed = simDuration + gameDuration;

export { mixed };
