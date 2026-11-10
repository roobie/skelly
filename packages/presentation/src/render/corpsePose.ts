import type { ActorClips, DeathClip } from '@skelly/engine/content';
import { blendPose, decodeFrame, type Pose, sampleClip } from '@skelly/engine/pose';

/** The built fall away from `direction`, when the figure bakes a death pair; other corpses keep their last pose. */
export const deathClip = (clips: ActorClips, direction: 1 | -1): DeathClip | undefined => {
  const death = clips.standing?.death;
  if (!(death && 'forward' in death)) {
    return undefined;
  }
  return direction === 1 ? death.forward : death.backward;
};

/** Real seconds between the death clip's first two frames: the span the fall takes to leave the living pose. */
export const deathBlendSeconds = (clip: DeathClip): number =>
  clip.frames.length > 1 ? clip.durationRealSeconds / (clip.frames.length - 1) : 0;

/**
 * The fall at `elapsedRealSeconds`, blended off the living `base` across the clip's first frame interval, then the
 * clip alone, holding its settled end. The fall is authored once, so every corpse settles in the same pose
 * (`docs/decisions/0010-asset-pipelines-in-skelly-assets.md`, "Canonical baked fall"). Pure, so settling stays
 * with the caller.
 */
export const corpseFallPose = (clip: DeathClip, base: Pose, elapsedRealSeconds: number): Pose => {
  const fall = decodeFrame(sampleClip(clip, elapsedRealSeconds));
  const blend = deathBlendSeconds(clip);
  return blend > 0 && elapsedRealSeconds < blend ? blendPose(base, fall, elapsedRealSeconds / blend) : fall;
};
