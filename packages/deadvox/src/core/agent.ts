import {
  angleOf,
  approachAngle,
  canStillAttack,
  haltActor,
  headingAt,
  horizontalDistance,
  inRange,
  onTerrainFloor,
  reachableActorMoves,
  steer,
  stepChaseMotion,
  sub,
  terrainStance,
  turnActorBodyLook,
  turnActorHeadLook,
  unit,
} from './actorMotion.ts';
import type { PlayerSense } from './actorSense.ts';
import { type Actor, type AgentMode, activeFusedMassMembers, copy } from './actorState.ts';
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
import { type Body, CONTACT_SKIN, type PhysicsParams, stepBody } from './physics.ts';
import type { SolidAt } from './raycast.ts';

export class AgentController {
  private readonly options: Pick<
    ActorSystemOptions,
    | 'isSoundBlocking'
    | 'isSunExposedAt'
    | 'tuning'
    | 'onSound'
    | 'blockSize'
    | 'terrainFloor'
    | 'physics'
    | 'bashObstacle'
    | 'isSolid'
    | 'meleeBlocker'
  >;
  private readonly tickScratch: ActorTickScratch;
  private readonly store: EntityStore<Actor>;
  private readonly agentHorde: AgentHorde;
  private readonly holdSpitGround: (scratch: ActorTickScratch, toward: Vec3) => void;
  constructor({
    options,
    tickScratch,
    store,
    agentHorde,
    holdSpitGround,
  }: {
    options: AgentController['options'];
    tickScratch: ActorTickScratch;
    store: EntityStore<Actor>;
    agentHorde: AgentHorde;
    holdSpitGround: AgentController['holdSpitGround'];
  }) {
    this.options = options;
    this.tickScratch = tickScratch;
    this.store = store;
    this.agentHorde = agentHorde;
    this.holdSpitGround = holdSpitGround;
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
      actor.agent.lastPerceived?.every((coordinate, axis) => coordinate === scratch.lightTarget![axis])
    ) {
      scratch.lightTarget = undefined;
    }
    if (scratch.sees && actor.agent.obstacleWanderRemaining > 0) {
      actor.agent.obstacleWanderRemaining = 0;
      actor.agent.obstacleWanderHeading = undefined;
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
    if (player.vocalNoise && actor.agent.lastVocalNoiseId !== player.vocalNoise.id) {
      actor.agent.lastVocalNoiseId = player.vocalNoise.id;
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
    if (sees || loud || lightTarget || actor.agent.hordeId !== undefined) {
      return false;
    }
    actor.agent.modeTimer = Math.max(0, actor.agent.modeTimer - dt);
    if (actor.agent.modeTimer > 0) {
      return true;
    }
    if (actor.agent.hesitationFrom === 'stroll') {
      actor.agent.mode = 'investigate';
      actor.agent.stimulusAt = time;
    } else {
      actor.agent.leanTarget = copy(actor.agent.lastPerceived!);
      actor.agent.refusedAt = time;
      actor.agent.lastPerceived = undefined;
      actor.agent.stimulusAt = undefined;
      this.beginIdle(actor);
    }
    actor.agent.hesitationFrom = undefined;
    this.announcePursuit('hesitate');
    return true;
  }

  updateAttention(): void {
    const { actor, time, sees, tier, player, lightTarget } = this.tickScratch;
    const previous = actor.agent.mode;
    if (previous === 'hesitate' && this.tickHesitation()) {
      return;
    }
    this.resolveAttention();
    const suspicious =
      actor.agent.refusedAt !== undefined &&
      time - actor.agent.refusedAt < actor.type.hearingModel.refusalSuspicionSimSeconds;
    if (
      (previous === 'idle' || previous === 'stroll') &&
      actor.agent.mode === 'investigate' &&
      tier &&
      this.tickScratch.vocal &&
      !sees &&
      !lightTarget &&
      actor.agent.hordeId === undefined &&
      !suspicious &&
      player.vocalNoise!.radiusMetres < actor.type.hearingModel.loudNoiseRadiusMetres
    ) {
      actor.agent.hesitationFrom = previous;
      actor.agent.mode = 'hesitate';
      actor.agent.modeTimer = inRange(actor.agent.behaviorRng, actor.type.hearingModel.hesitationSimSeconds);
    }
    if (actor.agent.mode !== 'hesitate') {
      actor.agent.hesitationFrom = undefined;
    }
    this.announcePursuit(previous);
  }

  private announcePursuit(previous: AgentMode): void {
    const { actor, time } = this.tickScratch;
    if (
      (actor.agent.mode === 'chase' || actor.agent.mode === 'investigate') &&
      previous !== 'chase' &&
      previous !== 'investigate'
    ) {
      actor.agent.leanTarget = undefined;
      this.cryAlert(actor, time);
    }
  }

  private cryAlert(actor: Actor, time: number): void {
    if (
      actor.agent.lastAlertAt !== undefined &&
      time - actor.agent.lastAlertAt < actor.type.hearingModel.alertCooldownSimSeconds
    ) {
      return;
    }
    actor.agent.lastAlertAt = time;
    this.options.onSound?.(actor.type.sounds.alert, copy(actor.body.pos), actor);
    this.chainStimuli.push({ caller: actor, origin: copy(actor.body.pos), target: copy(actor.agent.lastPerceived!) });
  }

  processChainStimuli(time: number): void {
    // Drain to closure before movement so entity iteration cannot delay a later caller's listeners.
    for (const stimulus of this.chainStimuli) {
      const { chainRadiusMetres, chainChance } = stimulus.caller.type.hearingModel;
      for (const [, actor] of this.store.entries()) {
        if (
          actor.incapacitated ||
          (actor.agent.mode !== 'idle' && actor.agent.mode !== 'stroll' && actor.agent.mode !== 'hesitate') ||
          horizontalDistance(actor.body.pos, stimulus.origin) * this.options.blockSize > chainRadiusMetres ||
          actor.agent.soundRng.next() >= chainChance
        ) {
          continue;
        }
        actor.agent.mode = 'investigate';
        actor.agent.hesitationFrom = undefined;
        actor.agent.investigationTier = 'far';
        actor.agent.searchAnchor = undefined;
        actor.agent.searchTimer = 0;
        actor.agent.searchStrolling = false;
        actor.agent.leanTarget = undefined;
        actor.agent.lastPerceived = copy(stimulus.target);
        actor.agent.stimulusAt = time;
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
      actor.agent.mode = 'chase';
      actor.agent.investigationTier = undefined;
      actor.agent.searchAnchor = undefined;
      actor.agent.searchTimer = 0;
      actor.agent.searchStrolling = false;
      actor.agent.lastPerceived = copy(player.pos);
    } else if (tier === 'near') {
      actor.agent.mode = 'investigate';
      actor.agent.investigationTier = 'near';
      actor.agent.searchAnchor = undefined;
      actor.agent.searchTimer = 0;
      actor.agent.searchStrolling = false;
      actor.agent.lastPerceived = copy(vocal?.tier === 'near' ? vocal.target : player.pos);
    } else if (lightTarget) {
      actor.agent.mode = 'investigate';
      actor.agent.investigationTier = 'near';
      actor.agent.searchAnchor = undefined;
      actor.agent.searchTimer = 0;
      actor.agent.searchStrolling = false;
      actor.agent.lastPerceived = copy(lightTarget);
    } else if (
      tier === 'far' &&
      (actor.agent.mode === 'idle' ||
        actor.agent.mode === 'stroll' ||
        actor.agent.mode === 'search' ||
        actor.agent.mode === 'hesitate')
    ) {
      actor.agent.mode = 'investigate';
      actor.agent.investigationTier = 'far';
      actor.agent.searchAnchor = undefined;
      actor.agent.searchTimer = 0;
      actor.agent.searchStrolling = false;
      actor.agent.lastPerceived =
        vocal?.tier === 'far'
          ? vocal.target
          : farBearingTarget({ def: actor.type, from: pos, source: player.pos, rng: scratch.rng, blockSize });
      const { terrainFloor } = this.options;
      const footprint = {
        halfWidth: actor.body.halfWidth,
        halfDepth: actor.body.halfDepth ?? actor.body.halfWidth,
      };
      if (terrainFloor && onTerrainFloor(pos, terrainFloor, footprint)) {
        actor.agent.lastPerceived[1] = terrainStance(
          actor.agent.lastPerceived[0],
          actor.agent.lastPerceived[2],
          terrainFloor,
          footprint,
        );
      }
    } else if (actor.agent.mode === 'chase') {
      actor.agent.mode = 'investigate';
      actor.agent.investigationTier = 'near';
    }
    if (sees || tier || lightTarget) {
      actor.agent.stimulusAt = scratch.time;
    }
    const groupTarget = sees || tier ? undefined : this.agentHorde.hordeTarget(actor);
    if (groupTarget) {
      actor.agent.mode = 'investigate';
      actor.agent.investigationTier = 'far';
      actor.agent.searchAnchor = undefined;
      actor.agent.searchTimer = 0;
      actor.agent.searchStrolling = false;
      actor.agent.lastPerceived = groupTarget;
    }
  }

  forgetIndividualStimulus(actor: Actor, time: number): void {
    if (
      actor.agent.hordeId !== undefined ||
      actor.agent.mode !== 'investigate' ||
      actor.agent.stimulusAt === undefined ||
      time - actor.agent.stimulusAt < actor.type.stimulusMemorySimSeconds
    ) {
      return;
    }
    actor.agent.stimulusAt = undefined;
    actor.agent.lastPerceived = undefined;
    actor.agent.investigationTier = undefined;
    actor.agent.searchAnchor = undefined;
    actor.agent.searchTimer = 0;
    actor.agent.searchStrolling = false;
    actor.agent.mode = 'return';
  }

  checkInvestigationArrival(): void {
    const scratch = this.tickScratch;
    const { actor, pos } = scratch;
    if (actor.agent.mode !== 'investigate') {
      return;
    }
    const target = actor.agent.lastPerceived ?? actor.agent.home;
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
    const {
      type,
      agent: { behaviorRng: rng },
    } = actor;
    actor.agent.lookTimer -= dt;
    if (actor.agent.lookTimer <= 0) {
      actor.agent.bodyLookTarget =
        angleOf(actor.facing) +
        rng.range(-type.wander.bodyLookArcDegrees, type.wander.bodyLookArcDegrees) * 0.5 * (Math.PI / 180);
      actor.agent.headYawTarget =
        rng.range(-type.wander.headLookArcDegrees, type.wander.headLookArcDegrees) * 0.5 * (Math.PI / 180);
      actor.agent.lookTimer = inRange(rng, type.wander.lookIntervalSimSeconds);
    }
    turnActorBodyLook(actor, type, dt);
    turnActorHeadLook(actor, type, dt);
  }

  beginIdle(actor: Actor): void {
    actor.agent.mode = 'idle';
    actor.agent.investigationTier = undefined;
    actor.agent.searchAnchor = undefined;
    actor.agent.searchTimer = 0;
    actor.agent.searchStrolling = false;
    actor.agent.modeTimer = inRange(actor.agent.behaviorRng, actor.type.wander.idleSimSeconds);
    actor.agent.lookTimer = 0;
    actor.agent.bodyLookTarget = angleOf(actor.facing);
    actor.agent.headYawTarget = 0;
    haltActor(actor);
  }

  private beginStroll(actor: Actor): void {
    const {
      type,
      body,
      agent: { home, behaviorRng },
    } = actor;
    const duration = inRange(behaviorRng, type.wander.strollSimSeconds);
    let heading = headingAt(behaviorRng.range(-Math.PI, Math.PI));
    if (actor.agent.leanTarget) {
      const toward = unit(sub(actor.agent.leanTarget, body.pos));
      const weight = type.hearingModel.refusalLean;
      heading = unit([
        heading[0] * (1 - weight) + toward[0] * weight,
        0,
        heading[2] * (1 - weight) + toward[2] * weight,
      ]);
      actor.agent.leanTarget = undefined;
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
    actor.agent.mode = 'stroll';
    actor.agent.investigationTier = undefined;
    actor.agent.searchAnchor = undefined;
    actor.agent.searchTimer = 0;
    actor.agent.searchStrolling = false;
    actor.agent.modeTimer = duration;
    actor.agent.strollHeading = heading;
    actor.agent.bodyLookTarget = angleOf(heading);
    actor.agent.headYawTarget = 0;
  }

  private beginSearch(actor: Actor): void {
    const {
      type,
      agent: { behaviorRng: rng },
    } = actor;
    actor.agent.mode = 'search';
    actor.agent.investigationTier = undefined;
    actor.agent.searchAnchor = copy(actor.agent.lastPerceived ?? actor.body.pos);
    actor.agent.searchTimer = inRange(rng, type.hearingModel.searchSimSeconds);
    actor.agent.searchStrolling = false;
    actor.agent.searchHeading = copy(actor.facing);
    actor.agent.modeTimer = inRange(rng, type.wander.idleSimSeconds);
    actor.agent.lookTimer = 0;
    actor.agent.bodyLookTarget = angleOf(actor.facing);
    actor.agent.headYawTarget = 0;
    haltActor(actor);
  }

  private beginSearchStroll(actor: Actor): void {
    const {
      type,
      body,
      agent: { behaviorRng: rng, searchAnchor },
    } = actor;
    if (!searchAnchor) {
      return;
    }
    const duration = Math.min(inRange(rng, type.hearingModel.searchStrollSimSeconds), actor.agent.searchTimer);
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
    actor.agent.searchStrolling = true;
    actor.agent.searchHeading = heading;
    actor.agent.modeTimer = duration;
    actor.agent.bodyLookTarget = angleOf(heading);
    actor.agent.headYawTarget = 0;
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
      inRange(actor.agent.soundRng, intervalSimSeconds) *
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
    if (actor.agent.mode !== 'idle' && actor.agent.mode !== 'stroll') {
      return;
    }
    actor.agent.idleSoundTimer -= dt;
    if (actor.agent.idleSoundTimer <= 0) {
      this.options.onSound?.(actor.type.sounds.idle, copy(pos), actor);
      actor.agent.idleSoundTimer = this.nextIdleSoundInterval(actor);
    }
  }

  selectMovementIntent(): void {
    const scratch = this.tickScratch;
    const { actor } = scratch;
    scratch.target = actor.agent.home;
    scratch.direction = [0, 0, 0];
    scratch.aimDirection = undefined;
    scratch.desiredSpeed = 0;
    scratch.returnArrived = false;
    scratch.obstacleDirection = actor.agent.obstacleWanderRemaining > 0 ? actor.agent.obstacleWanderHeading : undefined;
    scratch.stroll = actor.agent.mode === 'stroll';
    scratch.wanderingAtTickStart = actor.agent.obstacleWanderRemaining > 0;
    this.updateIdleSound();
    switch (actor.agent.mode) {
      case 'hesitate': {
        const bearing = angleOf(sub(actor.agent.lastPerceived!, actor.body.pos));
        actor.agent.headYawTarget = bearing - angleOf(actor.facing);
        actor.headYaw = approachAngle(
          actor.headYaw,
          actor.agent.headYawTarget,
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
    actor.agent.modeTimer -= dt;
    this.tickLookAround(actor, dt);
    if (actor.agent.modeTimer <= 0) {
      this.beginStroll(actor);
    }
  }

  private selectStrollIntent(): void {
    const scratch = this.tickScratch;
    const { actor, type, dt, obstacleDirection } = scratch;
    actor.agent.modeTimer -= dt;
    scratch.direction = obstacleDirection ?? actor.agent.strollHeading;
    scratch.aimDirection = scratch.direction;
    scratch.desiredSpeed = obstacleDirection || actor.agent.modeTimer > 0 ? type.speed.wanderMetresPerSimSecond : 0;
    scratch.direction = steer(actor, scratch.direction, (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180);
    actor.headYaw = approachAngle(actor.headYaw, 0, (type.wander.headTurnDegreesPerSimSecond * Math.PI * dt) / 180);
  }

  private selectSearchIntent(): void {
    const scratch = this.tickScratch;
    const { actor, type, dt, obstacleDirection, pos } = scratch;
    actor.agent.searchTimer -= dt;
    if (actor.agent.searchTimer <= 0) {
      actor.agent.mode = 'return';
      actor.agent.searchAnchor = undefined;
      actor.agent.searchStrolling = false;
      scratch.target = actor.agent.home;
      scratch.direction = obstacleDirection ?? unit([scratch.target[0] - pos[0], 0, scratch.target[2] - pos[2]]);
      scratch.aimDirection = scratch.direction;
      scratch.direction = steer(
        actor,
        scratch.direction,
        (type.wander.bodyTurnDegreesPerSimSecond * Math.PI * dt) / 180,
      );
      scratch.desiredSpeed = type.speed.wanderMetresPerSimSecond;
    } else if (actor.agent.searchStrolling) {
      actor.agent.modeTimer -= dt;
      if (actor.agent.modeTimer <= 0) {
        actor.agent.searchStrolling = false;
        actor.agent.modeTimer = inRange(scratch.rng, type.wander.idleSimSeconds);
        this.tickLookAround(actor, dt);
      } else {
        scratch.direction = obstacleDirection ?? actor.agent.searchHeading;
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
      actor.agent.modeTimer -= dt;
      this.tickLookAround(actor, dt);
      if (actor.agent.modeTimer <= 0) {
        this.beginSearchStroll(actor);
      }
    }
  }

  private selectTravelIntent(): void {
    const scratch = this.tickScratch;
    const { actor, type, player, blockSize, pos, obstacleDirection, dt } = scratch;
    if (actor.agent.mode === 'chase') {
      scratch.target = player.pos;
    } else if (actor.agent.mode === 'investigate') {
      scratch.target = actor.agent.lastPerceived ?? actor.agent.home;
    }
    scratch.metresToTarget = horizontalDistance(scratch.target, pos) * blockSize;
    scratch.returnArrived = actor.agent.mode === 'return' && scratch.metresToTarget < 0.4;
    scratch.seeking = actor.agent.mode === 'chase' || actor.agent.mode === 'investigate';
    scratch.inReach =
      actor.agent.mode === 'chase' && reachableActorMoves(actor, pos, scratch.target, this.options).length > 0;
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
    if (actor.agent.mode !== 'search' || !actor.agent.searchStrolling || !actor.agent.searchAnchor) {
      return;
    }
    const radius = horizontalDistance(scratch.pos, actor.agent.searchAnchor) * scratch.blockSize;
    const away = unit([scratch.pos[0] - actor.agent.searchAnchor[0], 0, scratch.pos[2] - actor.agent.searchAnchor[2]]);
    const outward = scratch.direction[0] * away[0] + scratch.direction[2] * away[2];
    if (outward > 0) {
      const remaining = Math.max(0, type.hearingModel.searchRadiusMetres - radius);
      actor.horizontalSpeed = Math.min(actor.horizontalSpeed, remaining / (dt * outward));
    }
  }

  applyObstacleSlide(): void {
    const scratch = this.tickScratch;
    const { actor, aimDirection, wanderingAtTickStart } = scratch;
    if (!wanderingAtTickStart && actor.obstacleContact && actor.agent.obstacleSlideSide !== 0 && aimDirection) {
      scratch.direction = headingAt(angleOf(aimDirection) + (actor.agent.obstacleSlideSide * Math.PI) / 2);
    }
  }

  private startObstacleWander(): void {
    const scratch = this.tickScratch;
    const { actor, sees, wanderingAtTickStart, obstacleContact, wasObstacleContact, aimDirection, rng } = scratch;
    if (
      !(sees || wanderingAtTickStart) &&
      obstacleContact &&
      !wasObstacleContact &&
      aimDirection &&
      rng.chance(actor.type.wander.obstacleWanderChance)
    ) {
      const physics = { ...this.options.physics, stepHeight: this.options.physics.stepHeight + CONTACT_SKIN * 2 };
      const headings = openWanderHeadings({
        body: actor.body,
        intent: aimDirection,
        isSolid: scratch.isSolid,
        physics,
        blockSize: scratch.blockSize,
      });
      if (headings.length > 0) {
        actor.agent.obstacleWanderHeading = headings[rng.int(0, headings.length - 1)]!;
        actor.agent.obstacleWanderRemaining = actor.type.wander.obstacleWanderDistanceMetres;
      }
    }
  }

  private updateObstacleSlideSide(openSide: (aim: Vec3) => -1 | 1 | undefined): void {
    const scratch = this.tickScratch;
    const { actor, obstacleContact, wasObstacleContact, aimDirection, jumpAttempted, travelled, rng } = scratch;
    if (!obstacleContact) {
      actor.agent.obstacleSlideSide = 0;
    } else if (!wasObstacleContact && aimDirection && !jumpAttempted) {
      const side = rng.int(0, 1) === 0 ? -1 : 1;
      actor.agent.obstacleSlideSide = openSide(aimDirection) ?? side;
    } else if (actor.agent.obstacleSlideSide !== 0 && !jumpAttempted && travelled < 0.0001) {
      actor.agent.obstacleSlideSide = actor.agent.obstacleSlideSide === -1 ? 1 : -1;
    }
  }

  updateObstacleContact(openSide: (aim: Vec3) => -1 | 1 | undefined, bodyAhead: (aim: Vec3) => Body): void {
    const scratch = this.tickScratch;
    const { actor, obstacleContact, travelled, wanderingAtTickStart } = scratch;
    scratch.wasObstacleContact = actor.obstacleContact;
    if (wanderingAtTickStart) {
      if (obstacleContact) {
        actor.agent.obstacleWanderRemaining = 0;
        actor.agent.obstacleWanderHeading = undefined;
      } else {
        actor.agent.obstacleWanderRemaining = Math.max(0, actor.agent.obstacleWanderRemaining - travelled);
        if (actor.agent.obstacleWanderRemaining === 0) {
          actor.agent.obstacleWanderHeading = undefined;
        }
      }
    }
    this.updateObstacleSlideSide(openSide);
    this.startObstacleWander();
    actor.obstacleContact = obstacleContact;
    this.bashObstacle(bodyAhead);
  }

  /**
   * A zombie held up on the way to its target bashes what holds it, once per attack cooldown, but only where that is
   * its one way through (`DESIGN.md`, "Senses and AI"): a piece it can walk past is left to its slide and wander.
   * Whether the blow does anything is the piece's gate, not the zombie's (`DESIGN.md`, "Base building and
   * electricity"); a type of strength 0 never bashes. A zombie whose blow lands stays at the piece instead of sliding
   * or wandering off along the wall.
   */
  private bashObstacle(bodyAhead: (aim: Vec3) => Body): void {
    const scratch = this.tickScratch;
    const { actor, type, obstacleContact, aimDirection } = scratch;
    const { bashObstacle } = this.options;
    if (
      !(bashObstacle && obstacleContact && aimDirection) ||
      type.strength <= 0 ||
      (actor.agent.mode !== 'chase' && actor.agent.mode !== 'investigate') ||
      actor.attackWait > 0 ||
      actor.attackWindup > 0
    ) {
      return;
    }
    const around = {
      body: actor.body,
      intent: aimDirection,
      isSolid: scratch.isSolid,
      physics: { ...this.options.physics, stepHeight: this.options.physics.stepHeight + CONTACT_SKIN * 2 },
      blockSize: scratch.blockSize,
    };
    if (
      hasWayAround(around, type.wander.wayAroundReachMetres, type.wander.wayAroundMinGainFraction) ||
      !bashObstacle(bodyAhead(aimDirection), type.strength)
    ) {
      return;
    }
    actor.attackWait = type.attack.cooldownSimSeconds;
    actor.agent.obstacleSlideSide = 0;
    actor.agent.obstacleWanderHeading = undefined;
    actor.agent.obstacleWanderRemaining = 0;
  }

  updateMovementDecisionAfterStep(scratch: ActorTickScratch) {
    const { stroll, actor, dt, travelled } = scratch;

    if (stroll && actor.agent.mode === 'stroll' && actor.horizontalSpeed > 0.01) {
      const requested = actor.horizontalSpeed * dt;
      if (travelled + 1e-4 < requested * 0.1) {
        this.beginIdle(actor);
      }
    }
    if (stroll && actor.agent.mode === 'stroll' && actor.agent.modeTimer <= 0 && actor.horizontalSpeed <= 0.01) {
      this.beginIdle(actor);
    }
    if (actor.agent.mode === 'search' && actor.agent.searchStrolling && actor.horizontalSpeed > 0.01) {
      const requested = actor.horizontalSpeed * dt;
      if (travelled + 1e-4 < requested * 0.1) {
        actor.agent.searchStrolling = false;
        actor.agent.modeTimer = inRange(scratch.rng, actor.type.wander.idleSimSeconds);
      }
    }
  }

  startActorAttack(actor: Actor, type: Actor['type'], pos: Vec3, player: PlayerSense): void {
    if (
      actor.agent.mode === 'chase' &&
      actor.staggerSimSeconds <= 0 &&
      actor.attackWait <= 0 &&
      actor.spitWindup <= 0 &&
      (type.model === 'fused-mass' ? activeFusedMassMembers(actor).length > 0 : canStillAttack(actor)) &&
      reachableActorMoves(actor, pos, player.pos, this.options).length > 0
    ) {
      this.options.onSound?.(type.sounds.attack, copy(pos), actor);
      actor.attackWindup = type.attack.windupSimSeconds;
      actor.attackWait = type.attack.cooldownSimSeconds;
    }
  }

  backgroundIntent(scratch: ActorTickScratch): { direction: Vec3; speed: number } {
    const { actor, player, blockSize, dt } = scratch;
    let target =
      actor.agent.mode === 'hesitate' ? undefined : (this.agentHorde.hordeTarget(actor) ?? actor.agent.lastPerceived);
    scratch.sees = actor.agent.mode === 'chase';
    if (scratch.sees) {
      target = player.pos;
    }
    let direction: Vec3;
    let speed: number;
    if (target) {
      const offset = sub(target, actor.body.pos);
      const distance = Math.hypot(offset[0], offset[2]) * blockSize;
      direction = distance > 0.5 ? unit([offset[0], 0, offset[2]]) : [0, 0, 0];
      speed =
        distance > 0.5
          ? Math.min(
              actor.type.speed.chaseMetresPerSimSecond,
              actor.type.speed.backgroundStepMetres / dt,
              distance / dt,
            )
          : 0;
      if (direction[0] !== 0 || direction[2] !== 0) {
        actor.facing = copy(direction);
      }
    } else {
      this.selectMovementIntent();
      const { direction: movementDirection, desiredSpeed } = scratch;
      direction = movementDirection;
      speed = desiredSpeed;
    }
    return { direction, speed };
  }
  finishBackgroundStroll(actor: Actor): void {
    if (actor.agent.mode === 'stroll' && actor.agent.modeTimer <= 0 && actor.horizontalSpeed <= 0.01) {
      this.beginIdle(actor);
    }
  }
}

const OBSTACLE_PROBE_DISTANCE_METRES = 0.75;
const OBSTACLE_PROBE_SPEED = 4;
const OBSTACLE_WANDER_ANGLES = [
  Math.PI / 4,
  -Math.PI / 4,
  Math.PI / 2,
  -Math.PI / 2,
  (3 * Math.PI) / 4,
  (-3 * Math.PI) / 4,
  Math.PI,
] as const;
/** The slanted headings that still gain ground toward an intent, which a zombie held up tries to get past a piece. */
const OBSTACLE_BYPASS_ANGLES = [Math.PI / 4, -Math.PI / 4] as const;
const WAY_AROUND_STEPS = 8;
interface ObstacleProbe {
  body: Body;
  intent: Vec3;
  isSolid: SolidAt;
  physics: PhysicsParams;
  blockSize: number;
}
/**
 * Where a body stands after walking `distanceMetres` along a heading, sliding along whatever blocks it. A contact
 * zeroes the blocked axis' speed, so a probe that must get past an edge asks for the heading again each of `steps`.
 */
const probeHeading = (
  { body, isSolid, physics, blockSize }: ObstacleProbe,
  heading: Vec3,
  distanceMetres: number,
  steps = 1,
): Vec3 => {
  const probe: Body = { ...body, pos: copy(body.pos), vel: [0, 0, 0] };
  for (let step = 0; step < steps; step++) {
    probe.vel = [(heading[0] * OBSTACLE_PROBE_SPEED) / blockSize, 0, (heading[2] * OBSTACLE_PROBE_SPEED) / blockSize];
    stepBody(probe, distanceMetres / OBSTACLE_PROBE_SPEED / steps, isSolid, physics);
  }
  return probe.pos;
};
const openWanderHeadings = (probe: ObstacleProbe): Vec3[] =>
  OBSTACLE_WANDER_ANGLES.map((offset) => headingAt(angleOf(probe.intent) + offset)).filter((heading) => {
    const end = probeHeading(probe, heading, OBSTACLE_PROBE_DISTANCE_METRES);
    const { pos } = probe.body;
    const progress = ((end[0] - pos[0]) * heading[0] + (end[2] - pos[2]) * heading[2]) * probe.blockSize;
    return progress >= OBSTACLE_PROBE_DISTANCE_METRES * 0.5;
  });
/**
 * Whether a body held up along its intent can walk past what holds it: within `reachMetres`, a slanted heading still
 * gains at least `minGainFraction` of the ground toward the intent that a clear one would. A wall slides the probe
 * along itself and gains none, so a piece in a doorway or a narrow gap has no way around, and clutter in the open has.
 */
const hasWayAround = (probe: ObstacleProbe, reachMetres: number, minGainFraction: number): boolean =>
  OBSTACLE_BYPASS_ANGLES.some((offset) => {
    const end = probeHeading(probe, headingAt(angleOf(probe.intent) + offset), reachMetres, WAY_AROUND_STEPS);
    const { pos } = probe.body;
    const gained = ((end[0] - pos[0]) * probe.intent[0] + (end[2] - pos[2]) * probe.intent[2]) * probe.blockSize;
    return gained >= reachMetres * Math.cos(offset) * minGainFraction;
  });
