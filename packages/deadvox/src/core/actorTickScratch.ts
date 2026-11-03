import type { PlayerSense } from './actorSense.ts';
import type { Actor } from './actorState.ts';

import type { HeardNoise, HearingInput, HearingTier, PerceptionInput } from './agentPerception.ts';
import type { Vec3 } from './coords.ts';
import type { DayPhaseState } from './dayPhase.ts';
import type { EntityId } from './entities.ts';
import type { Rng } from './random.ts';
import type { SolidAt } from './raycast.ts';
import type { ActorDef } from './schema.ts';

// Phases share this scratch to avoid per-zombie allocation; it lives apart from body primitives so their
// imports do not carry decision contracts. Write each per-zombie field before its first read.
// `test/actorSystem.test.ts`, `vocalNoiseDoesNotLeakBetweenActorPasses`, guards the cross-pass case.

export interface ActorTickScratch {
  dt: number;
  time: number;
  player: PlayerSense;
  dayState: DayPhaseState;
  blockSize: number;
  isSolid: SolidAt;
  isOpaque: SolidAt;
  groundedAtTickStart: Map<Actor, boolean>;
  id: EntityId;
  actor: Actor;
  type: ActorDef;
  rng: Rng;
  pos: Vec3;
  perception: PerceptionInput;
  hearingInput: HearingInput;
  sees: boolean;
  lightTarget?: Vec3 | undefined;
  vocal?: HeardNoise | undefined;
  tier?: HearingTier | undefined;
  target: Vec3;
  direction: Vec3;
  aimDirection?: Vec3 | undefined;
  desiredSpeed: number;
  returnArrived: boolean;
  obstacleDirection?: Vec3 | undefined;
  stroll: boolean;
  wanderingAtTickStart: boolean;
  metresToTarget: number;
  seeking: boolean;
  inReach: boolean;
  moving: boolean;
  jumpAttempted: boolean;
  beforeStep: Vec3;
  travelled: number;
  wallAhead: boolean;
  dx: number;
  dz: number;
  forward: number;
  obstacleContact: boolean;
  wasObstacleContact: boolean;
  stepHeightMetres: number;
}
export const createActorTickScratch = (): ActorTickScratch => ({
  dt: 0,
  time: 0,
  player: undefined as unknown as PlayerSense,
  dayState: undefined as unknown as DayPhaseState,
  blockSize: 0,
  isSolid: undefined as unknown as SolidAt,
  isOpaque: undefined as unknown as SolidAt,
  groundedAtTickStart: undefined as unknown as Map<Actor, boolean>,
  id: 0,
  actor: undefined as unknown as Actor,
  type: undefined as unknown as ActorDef,
  rng: undefined as unknown as Rng,
  pos: [0, 0, 0],
  perception: {} as PerceptionInput,
  hearingInput: {} as HearingInput,
  sees: false,
  lightTarget: undefined,
  vocal: undefined,
  tier: undefined,
  target: [0, 0, 0],
  direction: [0, 0, 0],
  aimDirection: undefined,
  desiredSpeed: 0,
  returnArrived: false,
  obstacleDirection: undefined,
  stroll: false,
  wanderingAtTickStart: false,
  metresToTarget: 0,
  seeking: false,
  inReach: false,
  moving: false,
  jumpAttempted: false,
  beforeStep: [0, 0, 0],
  travelled: 0,
  wallAhead: false,
  dx: 0,
  dz: 0,
  forward: 0,
  obstacleContact: false,
  wasObstacleContact: false,
  stepHeightMetres: 0,
});
