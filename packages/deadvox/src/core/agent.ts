import {
  angleOf,
  approachAngle,
  haltActor,
  headingAt,
  horizontalDistance,
  inRange,
  onTerrainFloor,
  steer,
  stepChaseMotion,
  sub,
  terrainStance,
  turnActorBodyLook,
  turnActorHeadLook,
  unit,
} from './actorMotion.ts';
import { type Actor, type AgentMode, copy } from './actorState.ts';
import type { ActorSystemOptions } from './actorSystem.ts';
import type { ActorTickScratch } from './actorTickScratch.ts';
import type { AgentHorde } from './agentHorde.ts';
import {
  farBearingTarget,
  hearingTier,
  hearVocalNoise,
  sameInvestigationFloor,
  seesPlayer,
  visibleLightTarget,
} from './agentPerception.ts';
import type { Vec3 } from './coords.ts';
import type { EntityStore } from './entities.ts';

export class AgentController {
  private readonly options: Pick<
    ActorSystemOptions,
    'isSoundBlocking' | 'isSunExposedAt' | 'tuning' | 'onSound' | 'blockSize' | 'terrainFloor'
  >;
  private readonly tickScratch: ActorTickScratch;
  private readonly store: EntityStore<Actor>;
  private readonly agentHorde: AgentHorde;
  private readonly holdSpitGround: (scratch: ActorTickScratch, toward: Vec3) => void;
  private readonly reachableActorMoves: (
    actor: Actor,
    actorPos: Vec3,
    playerPos: Vec3,
  ) => Actor['type']['attack']['moves'];
  constructor({
    options,
    tickScratch,
    store,
    agentHorde,
    holdSpitGround,
    reachableActorMoves,
  }: {
    options: AgentController['options'];
    tickScratch: ActorTickScratch;
    store: EntityStore<Actor>;
    agentHorde: AgentHorde;
    holdSpitGround: AgentController['holdSpitGround'];
    reachableActorMoves: AgentController['reachableActorMoves'];
  }) {
    this.options = options;
    this.tickScratch = tickScratch;
    this.store = store;
    this.agentHorde = agentHorde;
    this.holdSpitGround = holdSpitGround;
    this.reachableActorMoves = reachableActorMoves;
  }

  private readonly chainStimuli: { caller: Actor; origin: Vec3; target: Vec3 }[] = [];

  updatePerception(): void {
    const scratch = this.tickScratch;
    const { actor, type, pos, player, dayState, blockSize, isOpaque, time, rng, perception } = scratch;
    const soundBlocking = this.options.isSoundBlocking ?? scratch.isSolid;
    perception.def = type;
    perception.from = pos;
    perception.facing = actor.facing;
    perception.player = player;
    perception.dayPhase = dayState.phase;
    perception.sightBlend = dayState.sightBlend;
    perception.blockSize = blockSize;
    perception.isSolid = isOpaque;
    perception.isSunExposedAt = this.options.isSunExposedAt;
    perception.tuning = this.options.tuning;
    scratch.sees = seesPlayer(perception);
    scratch.lightTarget = visibleLightTarget({
      def: type,
      from: pos,
      facing: actor.facing,
      player,
      dayPhase: dayState.phase,
      blockSize,
      isOpaque,
      isSunExposedAt: this.options.isSunExposedAt,
      tuning: this.options.tuning,
    });
    if (
      scratch.lightTarget &&
      actor.lastPerceived?.every((coordinate, axis) => coordinate === scratch.lightTarget![axis])
    ) {
      scratch.lightTarget = undefined;
    }
    if (scratch.sees && actor.obstacleWanderRemaining > 0) {
      actor.obstacleWanderRemaining = 0;
      actor.obstacleWanderHeading = undefined;
    }
    const hearing = scratch.hearingInput;
    hearing.def = type;
    hearing.from = pos;
    hearing.player = player;
    hearing.blockSize = blockSize;
    hearing.isSolid = soundBlocking;
    hearing.rng = rng;
    hearing.tuning = this.options.tuning;
    scratch.vocal = undefined;
    if (player.vocalNoise && actor.lastVocalNoiseId !== player.vocalNoise.id) {
      actor.lastVocalNoiseId = player.vocalNoise.id;
      scratch.vocal = hearVocalNoise({
        def: type,
        from: pos,
        noise: player.vocalNoise,
        time,
        blockSize,
        isSolid: soundBlocking,
        rng,
        tuning: this.options.tuning,
      });
    }
    scratch.tier = scratch.sees ? undefined : (scratch.vocal?.tier ?? hearingTier(hearing));
  }

  private tickHesitation(): boolean {
    const { actor, time, sees, player, lightTarget, dt, vocal } = this.tickScratch;
    const loud = vocal && player.vocalNoise!.radiusMetres >= actor.type.hearingModel.loudNoiseRadiusMetres;
    if (sees || loud || lightTarget || actor.hordeId !== undefined) {
      return false;
    }
    actor.modeTimer = Math.max(0, actor.modeTimer - dt);
    if (actor.modeTimer > 0) {
      return true;
    }
    if (actor.hesitationFrom === 'stroll') {
      actor.mode = 'investigate';
      actor.stimulusAt = time;
    } else {
      actor.leanTarget = copy(actor.lastPerceived!);
      actor.refusedAt = time;
      actor.lastPerceived = undefined;
      actor.stimulusAt = undefined;
      this.beginIdle(actor);
    }
    actor.hesitationFrom = undefined;
    this.announcePursuit('hesitate');
    return true;
  }

  updateAttention(): void {
    const { actor, time, sees, tier, player, lightTarget } = this.tickScratch;
    const previous = actor.mode;
    if (previous === 'hesitate' && this.tickHesitation()) {
      return;
    }
    this.resolveAttention();
    const suspicious =
      actor.refusedAt !== undefined && time - actor.refusedAt < actor.type.hearingModel.refusalSuspicionSimSeconds;
    if (
      (previous === 'idle' || previous === 'stroll') &&
      actor.mode === 'investigate' &&
      tier &&
      this.tickScratch.vocal &&
      !sees &&
      !lightTarget &&
      actor.hordeId === undefined &&
      !suspicious &&
      player.vocalNoise!.radiusMetres < actor.type.hearingModel.loudNoiseRadiusMetres
    ) {
      actor.hesitationFrom = previous;
      actor.mode = 'hesitate';
      actor.modeTimer = inRange(actor.behaviorRng, actor.type.hearingModel.hesitationSimSeconds);
    }
    if (actor.mode !== 'hesitate') {
      actor.hesitationFrom = undefined;
    }
    this.announcePursuit(previous);
  }

  private announcePursuit(previous: AgentMode): void {
    const { actor, time } = this.tickScratch;
    if (
      (actor.mode === 'chase' || actor.mode === 'investigate') &&
      previous !== 'chase' &&
      previous !== 'investigate'
    ) {
      actor.leanTarget = undefined;
      this.cryAlert(actor, time);
    }
  }

  private cryAlert(actor: Actor, time: number): void {
    if (actor.lastAlertAt !== undefined && time - actor.lastAlertAt < actor.type.hearingModel.alertCooldownSimSeconds) {
      return;
    }
    actor.lastAlertAt = time;
    this.options.onSound?.(actor.type.sounds.alert, copy(actor.body.pos), actor);
    this.chainStimuli.push({ caller: actor, origin: copy(actor.body.pos), target: copy(actor.lastPerceived!) });
  }

  processChainStimuli(time: number): void {
    // Drain to closure before movement so entity iteration cannot delay a later caller's listeners.
    for (const stimulus of this.chainStimuli) {
      const { chainRadiusMetres, chainChance } = stimulus.caller.type.hearingModel;
      for (const [, actor] of this.store.entries()) {
        if (
          actor.incapacitated ||
          (actor.mode !== 'idle' && actor.mode !== 'stroll' && actor.mode !== 'hesitate') ||
          horizontalDistance(actor.body.pos, stimulus.origin) * this.options.blockSize > chainRadiusMetres ||
          actor.soundRng.next() >= chainChance
        ) {
          continue;
        }
        actor.mode = 'investigate';
        actor.hesitationFrom = undefined;
        actor.investigationTier = 'far';
        actor.searchAnchor = undefined;
        actor.searchTimer = 0;
        actor.searchStrolling = false;
        actor.leanTarget = undefined;
        actor.lastPerceived = copy(stimulus.target);
        actor.stimulusAt = time;
        this.cryAlert(actor, time);
      }
    }
    this.chainStimuli.length = 0;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Preserve precedence between sight, near/far noise, prior chase, and horde attention.
  private resolveAttention(): void {
    const scratch = this.tickScratch;
    const { actor, player, pos, tier, sees, vocal, blockSize, lightTarget } = scratch;
    if (sees) {
      actor.mode = 'chase';
      actor.investigationTier = undefined;
      actor.searchAnchor = undefined;
      actor.searchTimer = 0;
      actor.searchStrolling = false;
      actor.lastPerceived = copy(player.pos);
    } else if (tier === 'near') {
      actor.mode = 'investigate';
      actor.investigationTier = 'near';
      actor.searchAnchor = undefined;
      actor.searchTimer = 0;
      actor.searchStrolling = false;
      actor.lastPerceived = copy(vocal?.tier === 'near' ? vocal.target : player.pos);
    } else if (lightTarget) {
      actor.mode = 'investigate';
      actor.investigationTier = 'near';
      actor.searchAnchor = undefined;
      actor.searchTimer = 0;
      actor.searchStrolling = false;
      actor.lastPerceived = copy(lightTarget);
    } else if (
      tier === 'far' &&
      (actor.mode === 'idle' || actor.mode === 'stroll' || actor.mode === 'search' || actor.mode === 'hesitate')
    ) {
      actor.mode = 'investigate';
      actor.investigationTier = 'far';
      actor.searchAnchor = undefined;
      actor.searchTimer = 0;
      actor.searchStrolling = false;
      actor.lastPerceived =
        vocal?.tier === 'far'
          ? vocal.target
          : farBearingTarget({ def: actor.type, from: pos, source: player.pos, rng: scratch.rng, blockSize });
      const { terrainFloor } = this.options;
      const footprint = {
        halfWidth: actor.body.halfWidth,
        halfDepth: actor.body.halfDepth ?? actor.body.halfWidth,
      };
      if (terrainFloor && onTerrainFloor(pos, terrainFloor, footprint)) {
        actor.lastPerceived[1] = terrainStance(actor.lastPerceived[0], actor.lastPerceived[2], terrainFloor, footprint);
      }
    } else if (actor.mode === 'chase') {
      actor.mode = 'investigate';
      actor.investigationTier = 'near';
    }
    if (sees || tier || lightTarget) {
      actor.stimulusAt = scratch.time;
    }
    const groupTarget = sees || tier ? undefined : this.agentHorde.hordeTarget(actor);
    if (groupTarget) {
      actor.mode = 'investigate';
      actor.investigationTier = 'far';
      actor.searchAnchor = undefined;
      actor.searchTimer = 0;
      actor.searchStrolling = false;
      actor.lastPerceived = groupTarget;
    }
  }

  forgetIndividualStimulus(actor: Actor, time: number): void {
    if (
      actor.hordeId !== undefined ||
      actor.mode !== 'investigate' ||
      actor.stimulusAt === undefined ||
      time - actor.stimulusAt < actor.type.stimulusMemorySimSeconds
    ) {
      return;
    }
    actor.stimulusAt = undefined;
    actor.lastPerceived = undefined;
    actor.investigationTier = undefined;
    actor.searchAnchor = undefined;
    actor.searchTimer = 0;
    actor.searchStrolling = false;
    actor.mode = 'return';
  }

  checkInvestigationArrival(): void {
    const scratch = this.tickScratch;
    const { actor, pos } = scratch;
    if (actor.mode !== 'investigate') {
      return;
    }
    const target = actor.lastPerceived ?? actor.home;
    if (
      Math.hypot(...sub(target, pos)) * scratch.blockSize <= 1 &&
      sameInvestigationFloor(pos, target, this.options.terrainFloor, {
        halfWidth: actor.body.halfWidth,
        halfDepth: actor.body.halfDepth ?? actor.body.halfWidth,
      })
    ) {
      this.beginSearch(actor);
    }
  }

  private idleSoundGrid = new Map<string, Actor[]>();

  private idleSoundGridCellBlocks = 1;

  private tickLookAround(actor: Actor, dt: number): void {
    const { type, behaviorRng: rng } = actor;
    actor.lookTimer -= dt;
    if (actor.lookTimer <= 0) {
      actor.bodyLookTarget =
        angleOf(actor.facing) +
        rng.range(-type.wander.bodyLookArcDegrees, type.wander.bodyLookArcDegrees) * 0.5 * (Math.PI / 180);
      actor.headYawTarget =
        rng.range(-type.wander.headLookArcDegrees, type.wander.headLookArcDegrees) * 0.5 * (Math.PI / 180);
      actor.lookTimer = inRange(rng, type.wander.lookIntervalSimSeconds);
    }
    turnActorBodyLook(actor, type, dt);
    turnActorHeadLook(actor, type, dt);
  }

  beginIdle(actor: Actor): void {
    actor.mode = 'idle';
    actor.investigationTier = undefined;
    actor.searchAnchor = undefined;
    actor.searchTimer = 0;
    actor.searchStrolling = false;
    actor.modeTimer = inRange(actor.behaviorRng, actor.type.wander.idleSimSeconds);
    actor.lookTimer = 0;
    actor.bodyLookTarget = angleOf(actor.facing);
    actor.headYawTarget = 0;
    haltActor(actor);
  }

  private beginStroll(actor: Actor): void {
    const { type, body, home, behaviorRng } = actor;
    const duration = inRange(behaviorRng, type.wander.strollSimSeconds);
    let heading = headingAt(behaviorRng.range(-Math.PI, Math.PI));
    if (actor.leanTarget) {
      const toward = unit(sub(actor.leanTarget, body.pos));
      const weight = type.hearingModel.refusalLean;
      heading = unit([
        heading[0] * (1 - weight) + toward[0] * weight,
        0,
        heading[2] * (1 - weight) + toward[2] * weight,
      ]);
      actor.leanTarget = undefined;
    }
    const endpoint: Vec3 = [
      body.pos[0] + (heading[0] * type.speed.wanderMetresPerSimSecond * duration) / this.options.blockSize,
      body.pos[1],
      body.pos[2] + (heading[2] * type.speed.wanderMetresPerSimSecond * duration) / this.options.blockSize,
    ];
    if (horizontalDistance(endpoint, home) * this.options.blockSize > type.wander.leashMetres) {
      heading = unit([home[0] - body.pos[0], 0, home[2] - body.pos[2]]);
    }
    if (Math.hypot(...heading) === 0) {
      heading = headingAt(behaviorRng.range(-Math.PI, Math.PI));
    }
    actor.mode = 'stroll';
    actor.investigationTier = undefined;
    actor.searchAnchor = undefined;
    actor.searchTimer = 0;
    actor.searchStrolling = false;
    actor.modeTimer = duration;
    actor.strollHeading = heading;
    actor.bodyLookTarget = angleOf(heading);
    actor.headYawTarget = 0;
  }

  private beginSearch(actor: Actor): void {
    const { type, behaviorRng: rng } = actor;
    actor.mode = 'search';
    actor.investigationTier = undefined;
    actor.searchAnchor = copy(actor.lastPerceived ?? actor.body.pos);
    actor.searchTimer = inRange(rng, type.hearingModel.searchSimSeconds);
    actor.searchStrolling = false;
    actor.searchHeading = copy(actor.facing);
    actor.modeTimer = inRange(rng, type.wander.idleSimSeconds);
    actor.lookTimer = 0;
    actor.bodyLookTarget = angleOf(actor.facing);
    actor.headYawTarget = 0;
    haltActor(actor);
  }

  private beginSearchStroll(actor: Actor): void {
    const { type, body, searchAnchor, behaviorRng: rng } = actor;
    if (!searchAnchor) {
      return;
    }
    const duration = Math.min(inRange(rng, type.hearingModel.searchStrollSimSeconds), actor.searchTimer);
    let heading = headingAt(rng.range(-Math.PI, Math.PI));
    const endpoint: Vec3 = [
      body.pos[0] + (heading[0] * type.speed.wanderMetresPerSimSecond * duration) / this.options.blockSize,
      body.pos[1],
      body.pos[2] + (heading[2] * type.speed.wanderMetresPerSimSecond * duration) / this.options.blockSize,
    ];
    if (horizontalDistance(endpoint, searchAnchor) * this.options.blockSize > type.hearingModel.searchRadiusMetres) {
      heading = unit([searchAnchor[0] - body.pos[0], 0, searchAnchor[2] - body.pos[2]]);
    }
    if (Math.hypot(...heading) === 0) {
      heading = headingAt(rng.range(-Math.PI, Math.PI));
    }
    actor.searchStrolling = true;
    actor.searchHeading = heading;
    actor.modeTimer = duration;
    actor.bodyLookTarget = angleOf(heading);
    actor.headYawTarget = 0;
  }

  indexIdleSoundDensity(): void {
    let widestRadiusBlocks = 0;
    for (const [, actor] of this.store.entries()) {
      if (!actor.incapacitated) {
        widestRadiusBlocks = Math.max(
          widestRadiusBlocks,
          actor.type.idleSound.density.radiusMetres / this.options.blockSize,
        );
      }
    }
    this.idleSoundGridCellBlocks = Math.max(1, widestRadiusBlocks);
    this.idleSoundGrid = new Map();
    for (const [, actor] of this.store.entries()) {
      if (actor.incapacitated) {
        continue;
      }
      const key = this.idleSoundGridKey(actor.body.pos);
      const cell = this.idleSoundGrid.get(key);
      if (cell) {
        cell.push(actor);
      } else {
        this.idleSoundGrid.set(key, [actor]);
      }
    }
  }

  private idleSoundGridKey(position: Vec3): string {
    return `${Math.floor(position[0] / this.idleSoundGridCellBlocks)},${Math.floor(position[2] / this.idleSoundGridCellBlocks)}`;
  }

  private nextIdleSoundInterval(actor: Actor): number {
    const { intervalSimSeconds, density } = actor.type.idleSound;
    return (
      inRange(actor.soundRng, intervalSimSeconds) *
      (1 + (this.idleSoundDensity(actor) - 1) * density.penaltyPerNeighbour)
    );
  }

  private idleSoundDensity(actor: Actor): number {
    const radiusBlocks = actor.type.idleSound.density.radiusMetres / this.options.blockSize;
    const cellRadius = Math.ceil(radiusBlocks / this.idleSoundGridCellBlocks);
    const cellX = Math.floor(actor.body.pos[0] / this.idleSoundGridCellBlocks);
    const cellZ = Math.floor(actor.body.pos[2] / this.idleSoundGridCellBlocks);
    let density = 0;
    for (let x = cellX - cellRadius; x <= cellX + cellRadius; x++) {
      for (let z = cellZ - cellRadius; z <= cellZ + cellRadius; z++) {
        for (const nearby of this.idleSoundGrid.get(`${x},${z}`) ?? []) {
          if (horizontalDistance(actor.body.pos, nearby.body.pos) <= radiusBlocks) {
            density += 1;
          }
        }
      }
    }
    return density;
  }

  private updateIdleSound(): void {
    const scratch = this.tickScratch;
    const { actor, dt, pos } = scratch;
    if (actor.mode !== 'idle' && actor.mode !== 'stroll') {
      return;
    }
    actor.idleSoundTimer -= dt;
    if (actor.idleSoundTimer <= 0) {
      this.options.onSound?.(actor.type.sounds.idle, copy(pos), actor);
      actor.idleSoundTimer = this.nextIdleSoundInterval(actor);
    }
  }

  selectMovementIntent(): void {
    const scratch = this.tickScratch;
    const { actor } = scratch;
    scratch.target = actor.home;
    scratch.direction = [0, 0, 0];
    scratch.aimDirection = undefined;
    scratch.desiredSpeed = 0;
    scratch.returnArrived = false;
    scratch.obstacleDirection = actor.obstacleWanderRemaining > 0 ? actor.obstacleWanderHeading : undefined;
    scratch.stroll = actor.mode === 'stroll';
    scratch.wanderingAtTickStart = actor.obstacleWanderRemaining > 0;
    this.updateIdleSound();
    switch (actor.mode) {
      case 'hesitate': {
        const bearing = angleOf(sub(actor.lastPerceived!, actor.body.pos));
        actor.headYawTarget = bearing - angleOf(actor.facing);
        actor.headYaw = approachAngle(
          actor.headYaw,
          actor.headYawTarget,
          (actor.type.wander.headTurnDegreesPerSimSecond * Math.PI * scratch.dt) / 180,
        );
        return;
      }
      case 'idle':
        this.selectIdleIntent();
        return;
      case 'stroll':
        this.selectStrollIntent();
        return;
      case 'search':
        this.selectSearchIntent();
        return;
      default:
        this.selectTravelIntent();
    }
  }

  private selectIdleIntent(): void {
    const { actor, dt } = this.tickScratch;
    actor.modeTimer -= dt;
    this.tickLookAround(actor, dt);
    if (actor.modeTimer <= 0) {
      this.beginStroll(actor);
    }
  }

  private selectStrollIntent(): void {
    const scratch = this.tickScratch;
    const { actor, type, dt, obstacleDirection } = scratch;
    actor.modeTimer -= dt;
    scratch.direction = obstacleDirection ?? actor.strollHeading;
    scratch.aimDirection = scratch.direction;
    scratch.desiredSpeed = obstacleDirection || actor.modeTimer > 0 ? type.speed.wanderMetresPerSimSecond : 0;
    scratch.direction = steer(actor, scratch.direction, (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180);
    actor.headYaw = approachAngle(actor.headYaw, 0, (type.wander.headTurnDegreesPerSimSecond * Math.PI * dt) / 180);
  }

  private selectSearchIntent(): void {
    const scratch = this.tickScratch;
    const { actor, type, dt, obstacleDirection, pos } = scratch;
    actor.searchTimer -= dt;
    if (actor.searchTimer <= 0) {
      actor.mode = 'return';
      actor.searchAnchor = undefined;
      actor.searchStrolling = false;
      scratch.target = actor.home;
      scratch.direction = obstacleDirection ?? unit([scratch.target[0] - pos[0], 0, scratch.target[2] - pos[2]]);
      scratch.aimDirection = scratch.direction;
      scratch.direction = steer(
        actor,
        scratch.direction,
        (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180,
      );
      scratch.desiredSpeed = type.speed.wanderMetresPerSimSecond;
    } else if (actor.searchStrolling) {
      actor.modeTimer -= dt;
      if (actor.modeTimer <= 0) {
        actor.searchStrolling = false;
        actor.modeTimer = inRange(scratch.rng, type.wander.idleSimSeconds);
        this.tickLookAround(actor, dt);
      } else {
        scratch.direction = obstacleDirection ?? actor.searchHeading;
        scratch.aimDirection = scratch.direction;
        scratch.desiredSpeed = type.speed.wanderMetresPerSimSecond;
        scratch.direction = steer(
          actor,
          scratch.direction,
          (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180,
        );
        actor.headYaw = approachAngle(actor.headYaw, 0, (type.wander.headTurnDegreesPerSimSecond * Math.PI * dt) / 180);
      }
    } else {
      actor.modeTimer -= dt;
      this.tickLookAround(actor, dt);
      if (actor.modeTimer <= 0) {
        this.beginSearchStroll(actor);
      }
    }
  }

  private selectTravelIntent(): void {
    const scratch = this.tickScratch;
    const { actor, type, player, blockSize, pos, obstacleDirection, dt } = scratch;
    if (actor.mode === 'chase') {
      scratch.target = player.pos;
    } else if (actor.mode === 'investigate') {
      scratch.target = actor.lastPerceived ?? actor.home;
    }
    scratch.metresToTarget = horizontalDistance(scratch.target, pos) * blockSize;
    scratch.returnArrived = actor.mode === 'return' && scratch.metresToTarget < 0.4;
    scratch.seeking = actor.mode === 'chase' || actor.mode === 'investigate';
    scratch.inReach = actor.mode === 'chase' && this.reachableActorMoves(actor, pos, scratch.target).length > 0;
    const toward = unit([scratch.target[0] - pos[0], 0, scratch.target[2] - pos[2]]);
    scratch.direction = obstacleDirection ?? toward;
    scratch.moving = scratch.seeking ? !scratch.inReach : scratch.returnArrived || scratch.metresToTarget > 0.25;
    this.holdSpitGround(scratch, toward);
    if (scratch.moving) {
      scratch.aimDirection = scratch.direction;
      if (scratch.seeking) {
        const motion = stepChaseMotion(actor, dt);
        scratch.direction = headingAt(angleOf(scratch.direction) + motion.sway);
        scratch.desiredSpeed = type.speed.chaseMetresPerSimSecond * motion.speedFactor;
      } else if (!scratch.returnArrived) {
        scratch.desiredSpeed = type.speed.wanderMetresPerSimSecond;
      }
      const turnRadians = (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180;
      scratch.direction = steer(actor, scratch.direction, turnRadians, toward);
    } else {
      scratch.direction = [0, 0, 0];
    }
    actor.headYaw = approachAngle(actor.headYaw, 0, (type.wander.headTurnDegreesPerSimSecond * Math.PI * dt) / 180);
  }

  limitSearchStroll(scratch: ActorTickScratch, actor: Actor, type: Actor['type'], dt: number): void {
    if (actor.mode !== 'search' || !actor.searchStrolling || !actor.searchAnchor) {
      return;
    }
    const radius = horizontalDistance(scratch.pos, actor.searchAnchor) * scratch.blockSize;
    const away = unit([scratch.pos[0] - actor.searchAnchor[0], 0, scratch.pos[2] - actor.searchAnchor[2]]);
    const outward = scratch.direction[0] * away[0] + scratch.direction[2] * away[2];
    if (outward > 0) {
      const remaining = Math.max(0, type.hearingModel.searchRadiusMetres - radius);
      actor.horizontalSpeed = Math.min(actor.horizontalSpeed, remaining / (dt * outward));
    }
  }
}
