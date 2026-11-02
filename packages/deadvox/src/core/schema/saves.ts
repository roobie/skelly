import { strictObject } from 'valibot';
import { capabilityField } from './capability.ts';
import { Id, PositiveRealSeconds, PositiveSimSeconds } from './primitives.ts';

export const SaveTuningSchema = strictObject({
  id: Id,
  capability: capabilityField('saves'),
  /** Simulated seconds of play between periodic checkpoints, independent of the clock ratio. */
  checkpointSimSeconds: PositiveSimSeconds,
  /** Real seconds without a completed save before a running game confirms page exit. */
  leaveConfirmationRealSeconds: PositiveRealSeconds,
});
