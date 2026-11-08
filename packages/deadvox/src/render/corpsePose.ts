import type { Realized } from '@mobgen/core/generate.ts';
import { acidDeathPose } from '@mobgen/mob/acidPoses.ts';
import type { Pose } from '../core/pose.ts';

/** What the acid fall reads of a corpse's figure. */
export interface AcidCorpseVariant {
  readonly realized: Realized;
}

/** The acid corpse's fall at `elapsed` seconds; pure, so settling stays with the caller. */
export const acidCorpsePose = (variant: AcidCorpseVariant, basePose: Pose, elapsed: number, direction: 1 | -1): Pose =>
  acidDeathPose(variant.realized, basePose, elapsed, direction);
