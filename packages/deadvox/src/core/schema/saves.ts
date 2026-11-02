import { strictObject } from 'valibot';
import { Id, PositiveRealSeconds, PositiveSimSeconds } from './primitives.ts';

export const SaveTuningSchema = strictObject({
  id: Id,
  /** Simulated seconds of play between periodic checkpoints, independent of the clock ratio. */
  checkpointSimSeconds: PositiveSimSeconds,
  /** Real seconds without a completed save before a running game confirms page exit. */
  leaveConfirmationRealSeconds: PositiveRealSeconds,
});
