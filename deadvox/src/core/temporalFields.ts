type TemporalClock = 'Sim' | 'Game' | 'Real';
type TemporalUnit =
  | 'Milliseconds'
  | 'Seconds'
  | 'Minutes'
  | 'Hours'
  | 'TimeOfDay'
  | 'PerSecond'
  | 'PerMinute'
  | 'PerHour'
  | 'PerSecondSquared';
type TemporalDimension = 'duration' | 'instant' | 'timeOfDay' | 'rate' | 'acceleration';

export interface TemporalField {
  readonly path: string;
  readonly clock: TemporalClock;
  readonly unit: TemporalUnit;
  readonly dimension: TemporalDimension;
}

/** Authored temporal schema fields; the lint rule checks this catalogue against schemas and base content. */
export const TEMPORAL_FIELDS = [
  { path: 'items.container.pockets[].handlingSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'furniture.door.handlingSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'furniture.container.pockets[].handlingSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'items.food.rotsAfterGameHours', clock: 'Game', unit: 'Hours', dimension: 'duration' },
  { path: 'items.weapon.melee.cooldownSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'items.light.burnTimeGameHours', clock: 'Game', unit: 'Hours', dimension: 'duration' },
  { path: 'items.light.fuelPerGameHour', clock: 'Game', unit: 'PerHour', dimension: 'rate' },
  { path: 'items.light.power.chargePerGameHour', clock: 'Game', unit: 'PerHour', dimension: 'rate' },
  { path: 'items.book.readingGameMinutes', clock: 'Game', unit: 'Minutes', dimension: 'duration' },
  { path: 'items.disassembly.timeGameMinutes', clock: 'Game', unit: 'Minutes', dimension: 'duration' },
  { path: 'recipes.timeGameMinutes', clock: 'Game', unit: 'Minutes', dimension: 'duration' },
  { path: 'furniture.door.prying.timeSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'furniture.door.prying.fastestTimeSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'furniture.door.prying.strikeIntervalSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'models.action.fire.durationSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'models.action.fire.rearwardSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'models.action.fire.dwellSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'models.action.fire.forwardSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'models.action.hand.durationSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'models.action.hand.rearwardSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'models.action.hand.dwellSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'models.action.hand.forwardSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'models.action.roundsPerSimMinute', clock: 'Sim', unit: 'PerMinute', dimension: 'rate' },
  { path: 'sounds.minIntervalSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'skills.training.practicePerSimSecond', clock: 'Sim', unit: 'PerSecond', dimension: 'rate' },
  {
    path: 'skills.training.activities.readying.practicePerSimSecond',
    clock: 'Sim',
    unit: 'PerSecond',
    dimension: 'rate',
  },
  { path: 'skills.combat.firearms.raiseMinimumSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'skills.combat.firearms.raiseRangeSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'senses.crouch.speedMetresPerSimSecond', clock: 'Sim', unit: 'PerSecond', dimension: 'rate' },
  { path: 'senses.light.throwChargeSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'senses.light.throwMinimumHoldSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  {
    path: 'senses.light.throwArmSpeedMetresPerRealSecond',
    clock: 'Real',
    unit: 'PerSecond',
    dimension: 'rate',
  },
  { path: 'body.infectionOnsetGameHours', clock: 'Game', unit: 'Hours', dimension: 'duration' },
  { path: 'body.antisepticWindowGameHours', clock: 'Game', unit: 'Hours', dimension: 'duration' },
  { path: 'body.knockoutSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'body.staminaRegenDelaySimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'body.treatmentSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'body.bloodLossPerSimSecond', clock: 'Sim', unit: 'PerSecond', dimension: 'rate' },
  { path: 'body.bloodRecoveryPerSimSecond', clock: 'Sim', unit: 'PerSecond', dimension: 'rate' },
  { path: 'body.shockRecoveryPerSimSecond', clock: 'Sim', unit: 'PerSecond', dimension: 'rate' },
  { path: 'body.advancedInfectionHealthLossPerSimSecond', clock: 'Sim', unit: 'PerSecond', dimension: 'rate' },
  { path: 'layouts.startTimeGameTimeOfDay', clock: 'Game', unit: 'TimeOfDay', dimension: 'timeOfDay' },
  { path: 'layouts.shamblers.window.fromGameTimeOfDay', clock: 'Game', unit: 'TimeOfDay', dimension: 'timeOfDay' },
  { path: 'layouts.shamblers.window.toGameTimeOfDay', clock: 'Game', unit: 'TimeOfDay', dimension: 'timeOfDay' },
  { path: 'zombies.wander.idleSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'zombies.wander.strollSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'zombies.wander.lookIntervalSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'zombies.wander.bodyTurnDegreesPerSimSecond', clock: 'Sim', unit: 'PerSecond', dimension: 'rate' },
  { path: 'zombies.wander.headTurnDegreesPerSimSecond', clock: 'Sim', unit: 'PerSecond', dimension: 'rate' },
  { path: 'zombies.speed.wanderMetresPerSimSecond', clock: 'Sim', unit: 'PerSecond', dimension: 'rate' },
  { path: 'zombies.speed.chaseMetresPerSimSecond', clock: 'Sim', unit: 'PerSecond', dimension: 'rate' },
  {
    path: 'zombies.wander.movementAccelerationMetresPerSimSecondSquared',
    clock: 'Sim',
    unit: 'PerSecondSquared',
    dimension: 'acceleration',
  },
  { path: 'zombies.stimulusMemorySimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'zombies.hearingModel.searchSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'zombies.hearingModel.searchStrollSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'zombies.chaseMotion.swayIntervalSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'zombies.chaseMotion.lurchSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'zombies.chaseMotion.stumbleChancePerSimSecond', clock: 'Sim', unit: 'PerSecond', dimension: 'rate' },
  { path: 'zombies.chaseMotion.stumbleDurationSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'zombies.chaseMotion.stumbleEaseSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  {
    path: 'zombies.chaseMotion.stumbleDecelerationMetresPerSimSecondSquared',
    clock: 'Sim',
    unit: 'PerSecondSquared',
    dimension: 'acceleration',
  },
  { path: 'zombies.attack.cooldownSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
  { path: 'zombies.attack.windupSimSeconds', clock: 'Sim', unit: 'Seconds', dimension: 'duration' },
] as const satisfies readonly TemporalField[];
