export type { AcidGlobState } from './core/acidGlob.ts';
export type { AcidPuddleState } from './core/acidPuddle.ts';
export { PLAYER_CHEST_METRES } from './core/actorMotion.ts';
export type { PlayerMovement, PlayerSense, VocalNoise } from './core/actorSense.ts';
export { ActorSpawner } from './core/actorSpawns.ts';
export {
  type Actor,
  actorAttackReachForDef,
  actorAttackReachMetres,
  actorBodyDimensions,
  PLAYER_ARM_REACH_M,
} from './core/actorState.ts';
export {
  type AcidGroundImpact,
  type ActorAim,
  type ActorPlayerHit,
  ActorSystem,
  BACKGROUND_ACTOR_RATE,
  BACKGROUND_ACTOR_SLICE_COUNT,
  BACKGROUND_ACTOR_SLICE_RATE,
  type HitImpulse,
  type MeleeResult,
  type MeleeWeapon,
  pickActorHitRegion,
} from './core/actorSystem.ts';
export { loweredStanceTuning } from './core/agentPerception.ts';
export { BearTraps } from './core/bearTrap.ts';
export type { BlockBlow } from './core/blockDamage.ts';
export { BODY_REGIONS, Body, type BodyRegion, bodyRegionLabel } from './core/body.ts';
export { bookReadingHooks } from './core/bookReading.ts';
export {
  Character,
  type CraftCharacter,
  DEFAULT_HANDED_CHARACTER,
  dominantSide,
  type HandedCharacter,
  offSide,
  practiceForNextLevel,
  SKILL_LEVEL_MIN,
  skillEffectLevel,
  skillSaturation,
} from './core/character.ts';
export {
  calendarAt,
  formatClock,
  hourOfDay,
  nextSimTimeAt,
  nextTimeOfDay,
  parseTimeOfDay,
  SECONDS_PER_HOUR,
  skipTarget,
} from './core/clock.ts';
export { type CrosshairTarget, crosshairAimPoint, crosshairTarget } from './core/crosshairTarget.ts';
export { dayPhaseAt } from './core/dayPhase.ts';
export type { EntityId, EntityStore } from './core/entities.ts';
export { MapEntityStore } from './core/entities.ts';
export { advanceEventRules } from './core/eventRules.ts';
export type { PinState } from './core/explosive.ts';
export { blastShare, bodyCentre, Fuses, fragmentDirections, fragmentHitsOnBody, inSight } from './core/explosive.ts';
export {
  adsAcquisitionDuration,
  FIREARMS_SKILL_ZERO_RANGES,
  type FirearmStanceEffects,
  type FirearmsCombatTuning,
  type FirearmsSkillShotKind,
  type FirearmsSkillZeroEffect,
  type FirearmsSkillZeroHandling,
  firearmStanceEffects,
  firearmsSkillEffects,
  sameFirearmsSkillZeroHandling,
  skillZeroHandlingForFirearm,
  steadinessTuning,
} from './core/firearmsSkill.ts';
export { assertFoodExposure, foodMillisecondsAt, freshnessWord, isRotten, servingDef } from './core/food.ts';
export { pickFurniture } from './core/furniturePick.ts';
export { worldGravity } from './core/gravity.ts';
export { interactionAffordance } from './core/interactionAffordance.ts';
export type { InteractionTarget } from './core/interactionPick.ts';
export { pickInteractionTarget } from './core/interactionPick.ts';
export type { LongJob, RestAction, RestKind } from './core/longAction.ts';
export type { BlockJolt } from './core/meleeCombat.ts';
export { blockJolt, meleeBlock } from './core/meleeCombat.ts';
export { modified } from './core/modifiers.ts';
export type { Needs } from './core/needs.ts';
export { canSprint, consume, spendStamina, stepStamina } from './core/needs.ts';
export type { PainReading } from './core/pain.ts';
export { coneDirection, type PelletShot, pelletShotFromBasis, projectileShot } from './core/pellets.ts';
export { type BeginMeleeSwing, copyMeleeWeapon, PlayerCombat } from './core/playerCombat.ts';
export type { PlayerState } from './core/playerState.ts';
export { pryPlan } from './core/prying.ts';
export {
  bindReach,
  bodyInReach,
  furnitureDistance,
  pileDistance,
  type ReachPlayer,
  type ReachSnapshot,
  reachTuning,
  vehicleDistance,
} from './core/reach.ts';
export { ScenarioCitySite } from './core/scenarioCity.ts';
export { discoveryForPlan, nearDiscoveryBox, type ScenarioDiscovery } from './core/scenarioDiscovery.ts';
export type { ScenarioKind } from './core/scenarioKinds.ts';
export type { ScenarioRunState } from './core/scenarioRun.ts';
export { assertScenarioRun, ScenarioRun } from './core/scenarioRun.ts';
export type { ShotTrace } from './core/shotTrace.ts';
export { traceShot } from './core/shotTrace.ts';
export { Simulation } from './core/sim.ts';
export type { ColumnSource, PlaytestMarks, Rect, Site } from './core/site.ts';
export {
  craftingActivityTier,
  firearmShotPracticeSkill,
  firearmSteadinessSkill,
  firearmsCombatTuning,
  meleeCombatTuning,
  skillActivityPractice,
  skillActivityPracticeRate,
} from './core/skillTraining.ts';
export { insideStageArea, stageMarkArea, stageMarksAt } from './core/stageMarks.ts';
export { applyStartState } from './core/startState.ts';
export { type StorageStats, storageStats } from './core/storage.ts';
export { strikeTerrain } from './core/terrainStrike.ts';
export {
  type GameSeconds,
  gameSeconds,
  gameSecondsToMinutes,
  type RealSeconds,
  type RealTimestamp,
  realSeconds,
  realTimestamp,
  type SimSeconds,
  simSeconds,
  simTimestamp,
  simToGameSeconds,
} from './core/time.ts';
export {
  ActionMenu,
  emoteRadialEntries,
  heldRadialEntries,
  type RadialAction,
  radialEntries,
  radialEntryIndex,
} from './game/actionMenu.ts';
export { EmotePress } from './game/emotePress.ts';
export { firearmBoreRay, firearmBoreTarget } from './game/firearmAim.ts';
export { furnitureActionsFor } from './game/furnitureActions.ts';
export {
  HeldActionPress,
  type HeldActionTrigger,
  type HeldUseState,
  heldMenuOpens,
  heldUsePressTaken,
} from './game/heldActionPress.ts';
export { unarmedMeleeWeapon } from './game/melee.ts';
export { createPlayerBody, type MoveIntent, physicsFor, playerTuning } from './game/player.ts';
export { PlayerTickActions } from './game/playerTickActions.ts';
export { selectPrimaryAction } from './game/primaryAction.ts';
export { restKindForFurniture } from './game/rest.ts';
export { ACTIVE_ACTOR_RATE } from './game/simulationRates.ts';
export { Survival } from './game/survival.ts';
