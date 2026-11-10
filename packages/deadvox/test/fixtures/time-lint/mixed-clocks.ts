import type { SimSeconds } from '../../../../engine/src/core/time.ts';
import type { GameSeconds } from '../../../../engine/src/sim.ts';

const mixed = (simDuration: SimSeconds, gameDuration: GameSeconds): number => simDuration + gameDuration;

export { mixed };
