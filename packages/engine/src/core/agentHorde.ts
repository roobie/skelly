import { horizontalDistance } from './actorMotion.ts';
import type { HearingTier, PlayerSense, SoundHearing, SoundSource } from './actorSense.ts';
import { type Actor, copy, projectSnapshot, validRngState, validVec3State } from './actorState.ts';
import type { ActorSystemOptions } from './actorSystem.ts';
import { heardTarget, soundTier, surerHearing, surerTier } from './agentPerception.ts';
import type { Vec3 } from './coords.ts';
import type { DayPhase } from './dayPhase.ts';
import type { EntityStore } from './entities.ts';
import type { Rng, RngState } from './random.ts';
import type { ActorDef } from './schema.ts';

/** How surely a horde heard the sound it follows, and which sound that was. */
export interface HordeHeard {
  tier: HearingTier;
  source: string;
}
export const HORDE_MODES = ['stray', 'roam', 'noise', 'release'] as const;
export interface HordeState {
  id: string;
  type: string;
  /** Where the horde's last attention was; with nothing drawing it, the horde strays around it. */
  attention: Vec3;
  target: Vec3;
  /** `release` heads for `target` without forgetting it, so an event's horde reaches where it was sent. */
  mode: (typeof HORDE_MODES)[number];
  roamTimer: number;
  /** Present exactly in `noise` mode. */
  heard?: HordeHeard | undefined;
  /** Keys of world sounds the horde got used to; they no longer draw it. */
  habituated: string[];
  lastNoiseId: number;
  rng: RngState;
}
const hearingTiers: readonly HearingTier[] = ['near', 'far'];
const validHeard = (horde: HordeState): boolean =>
  horde.heard === undefined
    ? horde.mode !== 'noise'
    : horde.mode === 'noise' && hearingTiers.includes(horde.heard.tier) && horde.heard.source.length > 0;
const validHabituated = (habituated: readonly string[]): boolean =>
  Array.isArray(habituated) &&
  habituated.every((key) => typeof key === 'string' && key.length > 0) &&
  new Set(habituated).size === habituated.length;
export const validHordeSnapshotState = (
  horde: HordeState,
  hasHorde: boolean,
  resolveType: (id: string) => ActorDef | undefined,
): boolean =>
  horde.id.length > 0 &&
  !hasHorde &&
  resolveType(horde.type) !== undefined &&
  validVec3State(horde.attention) &&
  validVec3State(horde.target) &&
  HORDE_MODES.includes(horde.mode) &&
  Number.isFinite(horde.roamTimer) &&
  horde.roamTimer >= 0 &&
  Number.isSafeInteger(horde.lastNoiseId) &&
  horde.lastNoiseId >= 0 &&
  validHeard(horde) &&
  validHabituated(horde.habituated) &&
  validRngState(horde.rng);
const hordeSnapshotFields = [
  'id',
  'type',
  'attention',
  'target',
  'mode',
  'roamTimer',
  'heard',
  'habituated',
  'lastNoiseId',
  'rng',
] as const satisfies readonly (keyof HordeState)[];
type HordeSnapshotField = (typeof hordeSnapshotFields)[number];
export type HordeSnapshot = Pick<HordeState, HordeSnapshotField> &
  Record<Exclude<keyof HordeState, HordeSnapshotField>, never>;
interface HordeSnapshotInput {
  readonly horde: Omit<HordeState, 'rng'>;
  readonly rng: Rng;
}
export type HordeSnapshotProjectors = {
  [K in HordeSnapshotField]-?: (input: HordeSnapshotInput) => HordeSnapshot[K];
} & Record<Exclude<keyof HordeState, HordeSnapshotField>, never>;
const hordeSnapshotProjectors = {
  id: ({ horde }) => horde.id,
  type: ({ horde }) => horde.type,
  attention: ({ horde }) => [...horde.attention],
  target: ({ horde }) => [...horde.target],
  mode: ({ horde }) => horde.mode,
  roamTimer: ({ horde }) => horde.roamTimer,
  heard: ({ horde }) => horde.heard && { ...horde.heard },
  habituated: ({ horde }) => [...horde.habituated],
  lastNoiseId: ({ horde }) => horde.lastNoiseId,
  rng: ({ rng }) => [...rng.state()] as RngState,
} satisfies HordeSnapshotProjectors;
export const snapshotHorde = (horde: Omit<HordeState, 'rng'>, rng: Rng): HordeSnapshot =>
  projectSnapshot({ horde, rng }, hordeSnapshotProjectors) as HordeSnapshot;

/** Player vocal noises share one source, so a newer shout heard near again refines the target like a hum does. */
const PLAYER_VOICE_SOURCE = 'player-voice';
export const HORDE_ARRIVAL_METRES = 3;
const reached = (from: Vec3, target: Vec3, blockSize: number): boolean =>
  horizontalDistance(from, target) * blockSize <= HORDE_ARRIVAL_METRES;

/** A horde following a sound walks its stretch unless a surer sound arrives or the same sound is heard near again. */
const movesHorde = ({
  horde,
  tier,
  source,
}: {
  horde: Omit<HordeState, 'rng'>;
  tier: HearingTier;
  source: string;
}): boolean =>
  horde.heard === undefined || surerTier(tier, horde.heard.tier) || (tier === 'near' && source === horde.heard.source);

/** Sends a horde to a seeded point within a band around `around`, and draws how long it walks there before re-picking. */
const wanderAround = ({
  horde,
  rng,
  around,
  minMetres,
  maxMetres,
  blockSize,
}: {
  horde: Omit<HordeState, 'rng'>;
  rng: Rng;
  around: Vec3;
  minMetres: number;
  maxMetres: number;
  blockSize: number;
}): void => {
  const angle = rng.range(-Math.PI, Math.PI);
  const distance = rng.range(minMetres, maxMetres) / blockSize;
  horde.target = [around[0] + Math.cos(angle) * distance, around[1], around[2] + Math.sin(angle) * distance];
  horde.roamTimer = rng.range(16, 28);
};

export class AgentHorde {
  private readonly options: Pick<ActorSystemOptions, 'blockSize' | 'isSoundBlocking' | 'isSolid' | 'tuning'>;
  private readonly store: EntityStore<Actor>;
  constructor(options: AgentHorde['options'], store: EntityStore<Actor>) {
    this.options = options;
    this.store = store;
  }

  readonly hordes = new Map<string, { state: Omit<HordeState, 'rng'>; rng: Rng }>();

  private hordeCenter(id: string): Vec3 | undefined {
    const members = [...this.store.entries()].flatMap(([, actor]) => (actor.agent?.hordeId === id ? [actor] : []));
    if (members.length === 0) {
      return undefined;
    }
    return members.reduce<Vec3>(
      (sum, actor) => [
        sum[0] + actor.body.pos[0] / members.length,
        sum[1] + actor.body.pos[1] / members.length,
        sum[2] + actor.body.pos[2] / members.length,
      ],
      [0, 0, 0],
    );
  }

  hordeTarget(actor: Actor): Vec3 | undefined {
    if (!actor.agent || actor.agent.hordeId === undefined || actor.agent.hordeOffset === undefined) {
      return undefined;
    }
    const horde = this.hordes.get(actor.agent.hordeId)?.state;
    return horde
      ? [
          horde.target[0] + actor.agent.hordeOffset[0],
          horde.target[1] + actor.agent.hordeOffset[1],
          horde.target[2] + actor.agent.hordeOffset[2],
        ]
      : undefined;
  }

  private hears(def: ActorDef, from: Vec3, source: SoundSource): SoundHearing | undefined {
    const { blockSize, tuning } = this.options;
    const isSolid = this.options.isSoundBlocking ?? this.options.isSolid;
    return soundTier({ def, from, source, blockSize, isSolid, tuning });
  }

  /**
   * A member's sighting becomes its horde's last attention the moment it is seen, replacing any sound or release the
   * horde followed, so losing sight before the next horde update still leaves the group where it last saw its prey.
   */
  attendSighting(actor: Actor, seen: Vec3, dayPhase: DayPhase): void {
    const horde = actor.agent?.hordeId === undefined ? undefined : this.hordes.get(actor.agent.hordeId)?.state;
    if (!horde) {
      return;
    }
    horde.attention = copy(seen);
    horde.target = copy(seen);
    horde.heard = undefined;
    horde.mode = dayPhase === 'day' ? 'stray' : 'roam';
    horde.roamTimer = 0;
  }

  private chasing(horde: Omit<HordeState, 'rng'>): boolean {
    return [...this.store.entries()].some(([, { agent }]) => agent?.hordeId === horde.id && agent.mode === 'chase');
  }

  /**
   * The target of the surest sound that moves a horde: the player's vocal noise once per id, or any listed world sound
   * the horde has not got used to.
   */
  private surestHeard({
    horde,
    rng,
    def,
    from,
    nowSimSeconds,
    player,
  }: {
    horde: Omit<HordeState, 'rng'>;
    rng: Rng;
    def: ActorDef;
    from: Vec3;
    nowSimSeconds: number;
    player: PlayerSense;
  }): { target: Vec3; heard: HordeHeard } | undefined {
    const { blockSize } = this.options;
    const sounds: { source: SoundSource; key: string }[] = [];
    const noise = player.vocalNoise;
    if (noise && noise.id !== horde.lastNoiseId) {
      horde.lastNoiseId = noise.id;
      if (nowSimSeconds <= noise.expiresAt) {
        sounds.push({ source: noise, key: PLAYER_VOICE_SOURCE });
      }
    }
    for (const source of player.soundSources ?? []) {
      if (!horde.habituated.includes(source.key)) {
        sounds.push({ source, key: source.key });
      }
    }
    let surest: { source: SoundSource; key: string; hearing: SoundHearing } | undefined;
    for (const { source, key } of sounds) {
      const hearing = this.hears(def, from, source);
      if (
        hearing &&
        movesHorde({ horde, tier: hearing.tier, source: key }) &&
        (!surest || surerHearing(hearing, surest.hearing) < 0)
      ) {
        surest = { source, key, hearing };
      }
    }
    if (!surest) {
      return undefined;
    }
    const { tier } = surest.hearing;
    return {
      target: heardTarget({ def, from, source: surest.source, tier, blockSize, rng }),
      heard: { tier, source: surest.key },
    };
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep ordered noise, sight, arrival, habituation, night-roam and day-stray transitions together as one horde state machine.
  updateHordes(dt: number, time: number, player: PlayerSense, dayPhase: DayPhase): void {
    const { blockSize } = this.options;
    for (const { state: horde, rng } of this.hordes.values()) {
      const center = this.hordeCenter(horde.id);
      const member = [...this.store.entries()].find(([, actor]) => actor.agent?.hordeId === horde.id)?.[1];
      if (!(center && member?.type.agent)) {
        continue;
      }
      // A chase holds the sighting `attendSighting` recorded; no sound or wander may move it until sight is lost.
      if (this.chasing(horde)) {
        continue;
      }
      const def = member.type;
      const heard = this.surestHeard({ horde, rng, def, from: center, nowSimSeconds: time, player });
      if (heard) {
        horde.target = heard.target;
        horde.mode = 'noise';
        horde.heard = heard.heard;
        horde.attention = copy(heard.target);
      }
      const night = dayPhase !== 'day';
      const arrived = reached(center, horde.target, blockSize);
      if (horde.mode === 'noise' && arrived) {
        const { tier, source } = horde.heard!;
        // Only a sound heard near was found to hold nothing; a far waypoint walks on by hearing again.
        if (tier === 'near' && source !== PLAYER_VOICE_SOURCE && !horde.habituated.includes(source)) {
          horde.habituated.push(source);
        }
        horde.heard = undefined;
        horde.mode = night ? 'roam' : 'stray';
        horde.roamTimer = 0;
      } else if (horde.mode === 'release' && arrived) {
        horde.mode = night ? 'roam' : 'stray';
        horde.roamTimer = 0;
      }
      if (horde.mode === 'noise' || horde.mode === 'release') {
        continue;
      }
      horde.roamTimer -= dt;
      if (night) {
        if (horde.mode !== 'roam' || horde.roamTimer <= 0 || arrived) {
          wanderAround({ horde, rng, around: center, minMetres: 12, maxMetres: 20, blockSize });
          horde.mode = 'roam';
        }
      } else if (horde.mode !== 'stray' || horde.roamTimer <= 0 || arrived) {
        const maxMetres = def.agent!.hordeStrayRadiusMetres;
        wanderAround({ horde, rng, around: horde.attention, minMetres: 0, maxMetres, blockSize });
        horde.mode = 'stray';
      }
    }
  }
}
