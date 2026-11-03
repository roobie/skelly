import { horizontalDistance, inRange, onTerrainFloor, sub, terrainStance } from './actorMotion.ts';
import { type Actor, type AgentMode, copy } from './actorState.ts';
import type { ActorSystemOptions } from './actorSystem.ts';
import type { ActorTickScratch } from './actorTickScratch.ts';
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
  private readonly beginIdle: (actor: Actor) => void;
  private readonly beginSearch: (actor: Actor) => void;
  private readonly hordeTarget: (actor: Actor) => Vec3 | undefined;
  constructor({
    options,
    tickScratch,
    store,
    beginIdle,
    beginSearch,
    hordeTarget,
  }: {
    options: AgentController['options'];
    tickScratch: ActorTickScratch;
    store: EntityStore<Actor>;
    beginIdle: AgentController['beginIdle'];
    beginSearch: AgentController['beginSearch'];
    hordeTarget: AgentController['hordeTarget'];
  }) {
    this.options = options;
    this.tickScratch = tickScratch;
    this.store = store;
    this.beginIdle = beginIdle;
    this.beginSearch = beginSearch;
    this.hordeTarget = hordeTarget;
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
    const groupTarget = sees || tier ? undefined : this.hordeTarget(actor);
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
}
