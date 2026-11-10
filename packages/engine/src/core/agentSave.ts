import {
  type Actor,
  type ActorState,
  type AgentState,
  copy,
  projectSnapshot,
  type SavedAgentState,
  validVec3State,
} from './actorState.ts';
import type { Vec3 } from './coords.ts';
import type { RngState } from './random.ts';

export const validObstacleWanderState = (actor: ActorState): boolean =>
  actor.agent === undefined ||
  (Number.isFinite(actor.agent.obstacleWanderRemaining) &&
    actor.agent.obstacleWanderRemaining >= 0 &&
    actor.agent.obstacleWanderRemaining > 0 === (actor.agent.obstacleWanderHeading !== undefined) &&
    (actor.agent.obstacleWanderHeading === undefined ||
      (Array.isArray(actor.agent.obstacleWanderHeading) &&
        actor.agent.obstacleWanderHeading.length === 3 &&
        actor.agent.obstacleWanderHeading.every(Number.isFinite))) &&
    (actor.agent.obstacleSlideSide === -1 ||
      actor.agent.obstacleSlideSide === 0 ||
      actor.agent.obstacleSlideSide === 1));
export const validActorEventState = (actor: ActorState): boolean =>
  actor.agent === undefined ||
  ((actor.agent.hesitationFrom === undefined ||
    actor.agent.hesitationFrom === 'idle' ||
    actor.agent.hesitationFrom === 'stroll') &&
    (actor.agent.mode !== 'hesitate' ||
      (actor.agent.hesitationFrom !== undefined &&
        Number.isFinite(actor.agent.modeTimer) &&
        actor.agent.modeTimer >= 0 &&
        validVec3State(actor.agent.lastPerceived!))) &&
    (actor.agent.refusedAt === undefined || (Number.isFinite(actor.agent.refusedAt) && actor.agent.refusedAt >= 0)) &&
    (actor.agent.leanTarget === undefined || validVec3State(actor.agent.leanTarget)) &&
    (actor.agent.lastVocalNoiseId === null ||
      (Number.isSafeInteger(actor.agent.lastVocalNoiseId) && actor.agent.lastVocalNoiseId >= 0)) &&
    (actor.agent.stimulusAt === undefined ||
      (Number.isFinite(actor.agent.stimulusAt) && actor.agent.stimulusAt >= 0)) &&
    (actor.agent.lastAlertAt === undefined ||
      (Number.isFinite(actor.agent.lastAlertAt) && actor.agent.lastAlertAt >= 0)));
export const validHordeMemberState = (actor: ActorState): boolean =>
  actor.agent === undefined ||
  (actor.agent.hordeId === undefined && actor.agent.hordeOffset === undefined) ||
  (typeof actor.agent.hordeId === 'string' &&
    actor.agent.hordeId.length > 0 &&
    Array.isArray(actor.agent.hordeOffset) &&
    actor.agent.hordeOffset.length === 3 &&
    actor.agent.hordeOffset.every(Number.isFinite));
const agentSnapshotProjectors = {
  hordeId: (actor) => actor.hordeId,
  hordeOffset: (actor) => (actor.hordeOffset === undefined ? undefined : ([...actor.hordeOffset] as Vec3)),
  home: (actor) => [...actor.home],
  mode: (actor) => actor.mode,
  investigationTier: (actor) => actor.investigationTier,
  behaviorRng: (actor) => [...actor.behaviorRng.state()] as RngState,
  soundRng: (actor) => [...actor.soundRng.state()] as RngState,
  idleSoundTimer: (actor) => actor.idleSoundTimer,
  lastVocalNoiseId: (actor) => actor.lastVocalNoiseId ?? null,
  modeTimer: (actor) => actor.modeTimer,
  hesitationFrom: (actor) => actor.hesitationFrom,
  refusedAt: (actor) => actor.refusedAt,
  leanTarget: (actor) => (actor.leanTarget === undefined ? undefined : copy(actor.leanTarget)),
  searchAnchor: (actor) => (actor.searchAnchor === undefined ? undefined : [...actor.searchAnchor]),
  searchTimer: (actor) => actor.searchTimer,
  searchStrolling: (actor) => actor.searchStrolling,
  searchHeading: (actor) => [...actor.searchHeading],
  strollHeading: (actor) => [...actor.strollHeading],
  obstacleWanderHeading: (actor) =>
    actor.obstacleWanderHeading === undefined ? undefined : ([...actor.obstacleWanderHeading] as Vec3),
  obstacleWanderRemaining: (actor) => actor.obstacleWanderRemaining,
  obstacleSlideSide: (actor) => actor.obstacleSlideSide,
  bodyLookTarget: (actor) => actor.bodyLookTarget,
  headYawTarget: (actor) => actor.headYawTarget,
  lookTimer: (actor) => actor.lookTimer,
  lastPerceived: (actor) => (actor.lastPerceived === undefined ? undefined : [...actor.lastPerceived]),
  stimulusAt: (actor) => actor.stimulusAt,
  lastAlertAt: (actor) => actor.lastAlertAt,
} satisfies {
  [K in keyof SavedAgentState]-?: (actor: AgentState) => SavedAgentState[K];
};
export const snapshotAgent = (actor: Actor): SavedAgentState | undefined =>
  actor.agent === undefined ? undefined : (projectSnapshot(actor.agent, agentSnapshotProjectors) as SavedAgentState);
