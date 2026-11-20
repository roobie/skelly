import { horizontalDistance } from './actorMotion.ts';
import type { ContinuousSound, HearingTier, PlayerSense, SoundHearing, SoundSource } from './actorSense.ts';
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
export const HORDE_MODES = ['home', 'roam', 'noise', 'mill', 'release'] as const;
export interface HordeState {
  id: string;
  type: string;
  home: Vec3;
  target: Vec3;
  /**
   * `mill` wanders around a reached sound while it still sounds, so a humming plant holds its horde until it falls silent.
   * `release` heads for `target` without forgetting it, so an event's horde reaches where it was sent.
   */
  mode: (typeof HORDE_MODES)[number];
  roamTimer: number;
  /** Present exactly in `noise` and `mill` modes; a milling horde stands at its sound, so it hears it near. */
  heard?: HordeHeard | undefined;
  lastNoiseId: number;
  rng: RngState;
}
const hearingTiers: readonly HearingTier[] = ['near', 'far'];
const followsSound = (mode: HordeState['mode']): boolean => mode === 'noise' || mode === 'mill';
const validHeard = (horde: HordeState): boolean =>
  horde.heard === undefined
    ? !followsSound(horde.mode)
    : (horde.mode === 'noise' || (horde.mode === 'mill' && horde.heard.tier === 'near')) &&
      hearingTiers.includes(horde.heard.tier) &&
      horde.heard.source.length > 0;
export const validHordeSnapshotState = (
  horde: HordeState,
  hasHorde: boolean,
  resolveType: (id: string) => ActorDef | undefined,
): boolean =>
  horde.id.length > 0 &&
  !hasHorde &&
  resolveType(horde.type) !== undefined &&
  validVec3State(horde.home) &&
  validVec3State(horde.target) &&
  HORDE_MODES.includes(horde.mode) &&
  Number.isFinite(horde.roamTimer) &&
  horde.roamTimer >= 0 &&
  Number.isSafeInteger(horde.lastNoiseId) &&
  horde.lastNoiseId >= 0 &&
  validHeard(horde) &&
  validRngState(horde.rng);
const hordeSnapshotFields = [
  'id',
  'type',
  'home',
  'target',
  'mode',
  'roamTimer',
  'heard',
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
  home: ({ horde }) => [...horde.home],
  target: ({ horde }) => [...horde.target],
  mode: ({ horde }) => horde.mode,
  roamTimer: ({ horde }) => horde.roamTimer,
  heard: ({ horde }) => horde.heard && { ...horde.heard },
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

/**
 * A horde following a sound walks its stretch unless a surer sound arrives or the same sound is heard near again.
 * A milling horde already stands at its sound, so hearing that sound again must not pull it back onto the source.
 */
const movesHorde = ({
  horde,
  tier,
  source,
}: {
  horde: Omit<HordeState, 'rng'>;
  tier: HearingTier;
  source: string;
}): boolean =>
  horde.heard === undefined ||
  surerTier(tier, horde.heard.tier) ||
  (horde.mode === 'noise' && tier === 'near' && source === horde.heard.source);

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
   * The listed sound a horde follows, while it is still listed and the horde hears it near. Only near hearing knows
   * where the source stands, so a far wave at its waypoint walks on by hearing again instead of milling at the source.
   */
  private stillSounding(
    horde: Omit<HordeState, 'rng'>,
    def: ActorDef,
    from: Vec3,
    player: PlayerSense,
  ): ContinuousSound | undefined {
    const source = player.soundSources?.find(({ key }) => key === horde.heard?.source);
    return source && this.hears(def, from, source)?.tier === 'near' ? source : undefined;
  }

  /** The target of the surest sound that moves a horde: the player's vocal noise once per id, or any listed world sound. */
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
      sounds.push({ source, key: source.key });
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

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep ordered noise, arrival, mill, and night-roam transitions together as one horde state machine.
  updateHordes(dt: number, time: number, player: PlayerSense, dayPhase: DayPhase): void {
    const { blockSize } = this.options;
    for (const { state: horde, rng } of this.hordes.values()) {
      const center = this.hordeCenter(horde.id);
      const member = [...this.store.entries()].find(([, actor]) => actor.agent?.hordeId === horde.id)?.[1];
      if (!(center && member?.type.agent)) {
        continue;
      }
      const def = member.type;
      const heard = this.surestHeard({ horde, rng, def, from: center, nowSimSeconds: time, player });
      if (heard) {
        horde.target = heard.target;
        horde.mode = 'noise';
        horde.heard = heard.heard;
      }
      const night = dayPhase !== 'day';
      const arrived = reached(center, horde.target, blockSize);
      const settling = horde.mode === 'mill' || (horde.mode === 'noise' && arrived);
      const sounding = settling ? this.stillSounding(horde, def, center, player) : undefined;
      if (sounding) {
        horde.mode = 'mill';
        horde.heard = { tier: 'near', source: sounding.key };
        horde.roamTimer -= dt;
        if (horde.roamTimer <= 0 || arrived) {
          const maxMetres = def.agent!.hordeMillRadiusMetres;
          wanderAround({ horde, rng, around: sounding.pos, minMetres: 0, maxMetres, blockSize });
        }
      } else if (settling || (horde.mode === 'release' && arrived)) {
        horde.mode = night ? 'roam' : 'home';
        horde.heard = undefined;
        horde.roamTimer = 0;
      }
      const driven = followsSound(horde.mode) || horde.mode === 'release';
      if (!(night || driven)) {
        horde.mode = 'home';
        horde.target = copy(horde.home);
        horde.roamTimer = 0;
      } else if (night && !driven) {
        horde.roamTimer -= dt;
        if (horde.mode !== 'roam' || horde.roamTimer <= 0 || arrived) {
          wanderAround({ horde, rng, around: center, minMetres: 12, maxMetres: 20, blockSize });
          horde.mode = 'roam';
        }
      }
    }
  }
}
