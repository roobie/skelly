import type { SimSeconds } from '../../../src/core/time.ts';
import type { GameSeconds } from '../../../src/engine/sim.ts';

const mixed = (simDuration: SimSeconds, gameDuration: GameSeconds): number => simDuration + gameDuration;

export { mixed };
