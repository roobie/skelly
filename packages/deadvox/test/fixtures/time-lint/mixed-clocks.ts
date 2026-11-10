import type { SimSeconds } from '@skelly/engine/internal/core/time.ts';
import type { GameSeconds } from '@skelly/engine/sim';

const mixed = (simDuration: SimSeconds, gameDuration: GameSeconds): number => simDuration + gameDuration;

export { mixed };
