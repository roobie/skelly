// A freshly built actor's first standing frame, dispatched by body plan. The viewer used to pose every
// body through the humanoid idle layer and then overwrite non-humanoids with their own pose — which
// crashed on bodies without humanoid legs before the overwrite could run (see the dispatch comment
// below). This module is the one place that knows how each plan stands.

import type { Realized } from '../core/generate.ts';
import type { Pose } from '../core/pose.ts';
import type { BodyPlan } from '../core/template.ts';
import { crawlerPose } from './crawler.ts';
import { type DogStance, dogPose } from './dog.ts';
import type { WalkActor } from './gait.ts';
import { type IdleStance, idlePose } from './idle.ts';
import { quadrupedPose } from './quadrupedPose.ts';

/** Everything the standing layers read; only the humanoid idle stance needs the walk rig. */
export interface StandInputs {
  readonly walkActor: WalkActor;
  readonly idleStance: IdleStance;
  readonly idleTime: number;
  /** The dog build's stance (mob/dog.ts, DogStance); omitted stands an intact body. */
  readonly dogStance?: DogStance;
}

const STAND_POSES: Record<Exclude<BodyPlan, 'amalgam'>, (realized: Realized, inputs: StandInputs) => Pose> = {
  humanoid: (_realized, inputs) => idlePose(inputs.walkActor, inputs.idleStance, inputs.idleTime),
  crawler: (realized) => crawlerPose(realized),
  dog: (realized, inputs) => dogPose(realized, inputs.dogStance),
  quadruped: (realized) => quadrupedPose(realized),
};

/** Each pose-able plan stands through its own pose layer. Only the humanoid plans may stand through
 * mob/idle.ts's idle stance: its leg IK looks the thigh/shin/foot chain up by name (mob/idle.ts,
 * solveIdleLeg) and reads `.tail` off what it finds, so it must never be handed a body without that
 * chain — the quadruped names its leg bones per leg instead (mob/quadruped.ts, legBoneIds). The mapping
 * is total over the pose-able plans, so a new body plan must say how it stands. The amalgam stands
 * exactly as built and is posed at the caller (mobgen/src/viewer/main.ts, load). */
export const standPose = (bodyPlan: Exclude<BodyPlan, 'amalgam'>, realized: Realized, inputs: StandInputs): Pose =>
  STAND_POSES[bodyPlan](realized, inputs);
