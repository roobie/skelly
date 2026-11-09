import { decodeFrame, sampleClip } from '../core/actorClips.ts';
import type { Pose } from '../core/pose.ts';
import type { ActorClips, DeathClip } from '../core/schema/actors.ts';

/** The built fall away from `direction`, when the figure bakes a death pair; other corpses keep their last pose. */
export const deathClip = (clips: ActorClips, direction: 1 | -1): DeathClip | undefined => {
  const death = clips.standing?.death;
  if (!(death && 'forward' in death)) {
    return undefined;
  }
  return direction === 1 ? death.forward : death.backward;
};

/** The fall at `elapsedRealSeconds`; pure, so settling stays with the caller. */
export const corpseFallPose = (clip: DeathClip, elapsedRealSeconds: number): Pose =>
  decodeFrame(sampleClip(clip, elapsedRealSeconds));
