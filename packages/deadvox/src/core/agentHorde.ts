import { projectSnapshot, validRngState, validVec3State } from './actorState.ts';
import type { Vec3 } from './coords.ts';
import type { Rng, RngState } from './random.ts';
import type { ActorDef } from './schema.ts';

export interface HordeState {
  id: string;
  type: string;
  home: Vec3;
  target: Vec3;
  /** `release` heads for `target` without forgetting it, so an event's horde reaches where it was sent. */
  mode: 'home' | 'roam' | 'noise' | 'release';
  roamTimer: number;
  stimulusAt?: number | undefined;
  lastNoiseId: number;
  rng: RngState;
}
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
  ['home', 'roam', 'noise', 'release'].includes(horde.mode) &&
  Number.isFinite(horde.roamTimer) &&
  horde.roamTimer >= 0 &&
  Number.isSafeInteger(horde.lastNoiseId) &&
  horde.lastNoiseId >= 0 &&
  (horde.stimulusAt === undefined || (Number.isFinite(horde.stimulusAt) && horde.stimulusAt >= 0)) &&
  validRngState(horde.rng);
const hordeSnapshotFields = [
  'id',
  'type',
  'home',
  'target',
  'mode',
  'roamTimer',
  'stimulusAt',
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
  stimulusAt: ({ horde }) => horde.stimulusAt,
  lastNoiseId: ({ horde }) => horde.lastNoiseId,
  rng: ({ rng }) => [...rng.state()] as RngState,
} satisfies HordeSnapshotProjectors;
export const snapshotHorde = (horde: Omit<HordeState, 'rng'>, rng: Rng): HordeSnapshot =>
  projectSnapshot({ horde, rng }, hordeSnapshotProjectors) as HordeSnapshot;

import { horizontalDistance } from './actorMotion.ts';
import type { PlayerSense } from './actorSense.ts';
import { type Actor, copy } from './actorState.ts';
import type { ActorSystemOptions } from './actorSystem.ts';
import { hearVocalNoise } from './agentPerception.ts';
import type { DayPhase } from './dayPhase.ts';
import type { EntityStore } from './entities.ts';
export class AgentHorde {
  private readonly options: Pick<ActorSystemOptions, 'blockSize' | 'isSoundBlocking' | 'isSolid' | 'tuning'>;
  private readonly store: EntityStore<Actor>;
  constructor(options: AgentHorde['options'], store: EntityStore<Actor>) {
    this.options = options;
    this.store = store;
  }

  readonly hordes = new Map<string, { state: Omit<HordeState, 'rng'>; rng: Rng }>();

  private hordeCenter(id: string): Vec3 | undefined {
    const members = [...this.store.entries()].flatMap(([, actor]) => (actor.hordeId === id ? [actor] : []));
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
    if (actor.hordeId === undefined || actor.hordeOffset === undefined) {
      return undefined;
    }
    const horde = this.hordes.get(actor.hordeId)?.state;
    return horde
      ? [
          horde.target[0] + actor.hordeOffset[0],
          horde.target[1] + actor.hordeOffset[1],
          horde.target[2] + actor.hordeOffset[2],
        ]
      : undefined;
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep ordered noise, arrival, and night-roam transitions together as one horde state machine.
  updateHordes(dt: number, time: number, player: PlayerSense, dayPhase: DayPhase): void {
    const { blockSize } = this.options;
    const isSolid = this.options.isSoundBlocking ?? this.options.isSolid;
    for (const { state: horde, rng } of this.hordes.values()) {
      const center = this.hordeCenter(horde.id);
      const member = [...this.store.entries()].find(([, actor]) => actor.hordeId === horde.id)?.[1];
      if (!(center && member)) {
        continue;
      }
      const noise = player.vocalNoise;
      if (noise && noise.id !== horde.lastNoiseId) {
        horde.lastNoiseId = noise.id;
        const heard = hearVocalNoise({
          def: member.type,
          from: center,
          noise,
          time,
          blockSize,
          isSolid,
          rng,
          tuning: this.options.tuning,
        });
        if (heard) {
          horde.target = copy(heard.target);
          horde.mode = 'noise';
          horde.stimulusAt = time;
        }
      }
      const night = dayPhase !== 'day';
      const arrived = horizontalDistance(center, horde.target) * blockSize <= 3;
      if (
        horde.mode === 'noise' &&
        horde.stimulusAt !== undefined &&
        time - horde.stimulusAt >= member.type.stimulusMemorySimSeconds
      ) {
        horde.mode = night ? 'roam' : 'home';
        horde.stimulusAt = undefined;
        horde.roamTimer = 0;
      }
      if ((horde.mode === 'noise' || horde.mode === 'release') && arrived) {
        horde.mode = night ? 'roam' : 'home';
        horde.stimulusAt = undefined;
        horde.roamTimer = 0;
      }
      const driven = horde.mode === 'noise' || horde.mode === 'release';
      if (!(night || driven)) {
        horde.mode = 'home';
        horde.target = copy(horde.home);
        horde.roamTimer = 0;
      } else if (night && !driven) {
        horde.roamTimer -= dt;
        if (horde.mode !== 'roam' || horde.roamTimer <= 0 || arrived) {
          const angle = rng.range(-Math.PI, Math.PI);
          const distance = rng.range(12, 20) / blockSize;
          horde.target = [center[0] + Math.cos(angle) * distance, center[1], center[2] + Math.sin(angle) * distance];
          horde.mode = 'roam';
          horde.roamTimer = rng.range(16, 28);
        }
      }
    }
  }
}
