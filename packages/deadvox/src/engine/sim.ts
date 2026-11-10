export type { AcidGlobState } from '../core/acidGlob.ts';
export type { AcidPuddleState } from '../core/acidPuddle.ts';
export { PLAYER_CHEST_METRES } from '../core/actorMotion.ts';
export type { PlayerSense } from '../core/actorSense.ts';
export { type Actor, actorAttackReachForDef, actorAttackReachMetres, actorBodyDimensions } from '../core/actorState.ts';
export {
  type ActorAim,
  ActorSystem,
  BACKGROUND_ACTOR_RATE,
  BACKGROUND_ACTOR_SLICE_COUNT,
  BACKGROUND_ACTOR_SLICE_RATE,
  type HitImpulse,
  type MeleeResult,
} from '../core/actorSystem.ts';
export type { BlockBlow } from '../core/blockDamage.ts';
export { BODY_REGIONS, Body, type BodyRegion, bodyRegionLabel } from '../core/body.ts';
export {
  Character,
  type CraftCharacter,
  DEFAULT_HANDED_CHARACTER,
  dominantSide,
  type HandedCharacter,
  offSide,
  practiceForNextLevel,
} from '../core/character.ts';
export { calendarAt, formatClock, hourOfDay, nextTimeOfDay, parseTimeOfDay } from '../core/clock.ts';
export { crosshairTarget } from '../core/crosshairTarget.ts';
export { dayPhaseAt } from '../core/dayPhase.ts';
export type { EntityId, EntityStore } from '../core/entities.ts';
export type { PinState } from '../core/explosive.ts';
export {
  FIREARMS_SKILL_ZERO_RANGES,
  type FirearmsSkillShotKind,
  type FirearmsSkillZeroEffect,
  type FirearmsSkillZeroHandling,
} from '../core/firearmsSkill.ts';
export { assertFoodExposure } from '../core/food.ts';
export { worldGravity } from '../core/gravity.ts';
export { interactionAffordance } from '../core/interactionAffordance.ts';
export type { InteractionTarget } from '../core/interactionPick.ts';
export type { LongJob, RestAction, RestKind } from '../core/longAction.ts';
export type { BlockJolt } from '../core/meleeCombat.ts';
export type { Needs } from '../core/needs.ts';
export type { PainReading } from '../core/pain.ts';
export { pryPlan } from '../core/prying.ts';
export { bindReach, type ReachSnapshot, reachTuning } from '../core/reach.ts';
export { discoveryForPlan } from '../core/scenarioDiscovery.ts';
export type { ScenarioRunState } from '../core/scenarioRun.ts';
export type { ShotTrace } from '../core/shotTrace.ts';
export { Simulation } from '../core/sim.ts';
export type { PlaytestMarks, Rect } from '../core/site.ts';
export { firearmsCombatTuning } from '../core/skillTraining.ts';
export { insideStageArea, stageMarkArea, stageMarksAt } from '../core/stageMarks.ts';
export { applyStartState } from '../core/startState.ts';
export { type StorageStats, storageStats } from '../core/storage.ts';
export { type GameSeconds, type RealSeconds, type RealTimestamp, realSeconds, realTimestamp } from '../core/time.ts';
