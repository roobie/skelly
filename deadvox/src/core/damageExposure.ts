import { BODY_REGIONS, type BodyRegion, DAMAGE_KINDS, type DamageKind, TOUCHES, type Touch } from './body.ts';
import type { BodyTuningDef } from './schema.ts';
import { freezeSnapshot } from './snapshotData.ts';

interface ExposureSource {
  id: string;
  cause: string;
  rate: number;
  remaining?: number | undefined;
  touch?: Touch | undefined;
}

export interface ExposureContact {
  id: string;
  rate: number;
  cause: string;
  region: BodyRegion;
  kind: DamageKind;
  touch?: Touch | undefined;
}

export interface DamageExposure {
  region: BodyRegion;
  kind: DamageKind;
  damage: number;
  roll: number;
  infectionRoll: number;
  infectionAtRisk?: boolean;
  openedTier?: number;
  sources: ExposureSource[];
}

export interface DamageExposureState {
  simTimestamp: number;
  nextId: number;
  exposures: DamageExposure[];
}

const validRoll = (roll: number): boolean => Number.isFinite(roll) && roll >= 0 && roll < 1;

const sourceDamage = (source: ExposureSource, seconds: number, duration: number | undefined): number => {
  if (source.remaining === undefined) {
    return source.rate * seconds;
  }
  const start = source.remaining;
  const end = start - seconds < 1e-9 ? 0 : start - seconds;
  source.remaining = end;
  // Integrate the linear tail exactly, including a step that straddles its end.
  return duration === undefined ? 0 : source.rate * ((start + end) / 2 / duration) * (start - end);
};

/** A threshold draw belongs to the whole contact and its tail, not to a simulation step. */
export class DamageExposures {
  private state: DamageExposureState = { simTimestamp: 0, nextId: 0, exposures: [] };
  private readonly tuning: BodyTuningDef;
  private readonly draw: (id: number) => number;

  constructor(tuning: BodyTuningDef, draw: (id: number) => number) {
    this.tuning = tuning;
    this.draw = draw;
  }

  get active(): boolean {
    return this.state.exposures.length > 0;
  }

  /** Only a source that still harms refuses: worn protection lifts the refusal with the damage. */
  refusal(blocked: (exposure: DamageExposure, touch: Touch | undefined) => boolean = () => false): string | undefined {
    const harming = this.state.exposures.some((exposure) =>
      exposure.sources.some((source) => !blocked(exposure, source.touch)),
    );
    return harming ? this.tuning.exposureRefusal : undefined;
  }

  get simTimestamp(): number {
    return this.state.simTimestamp;
  }

  seek(simTimestamp: number): void {
    this.state.simTimestamp = simTimestamp;
  }

  snapshotState(): Readonly<DamageExposureState> {
    return freezeSnapshot(structuredClone(this.state));
  }

  restoreState(state: DamageExposureState): void {
    if (
      !Number.isFinite(state.simTimestamp) ||
      state.simTimestamp < 0 ||
      !Number.isSafeInteger(state.nextId) ||
      state.nextId < 0
    ) {
      throw new Error('Invalid exposure sequence');
    }
    const keys = new Set<string>();
    for (const exposure of state.exposures) {
      const key = `${exposure.region}:${exposure.kind}`;
      if (keys.has(key)) {
        throw new Error('Duplicate damage exposure');
      }
      keys.add(key);
      this.validateExposure(exposure);
    }
    this.state = structuredClone(state);
  }

  private validateExposure(exposure: DamageExposure): void {
    if (
      !(
        BODY_REGIONS.includes(exposure.region) &&
        DAMAGE_KINDS.includes(exposure.kind) &&
        Number.isFinite(exposure.damage)
      ) ||
      exposure.damage < 0 ||
      !validRoll(exposure.roll) ||
      !validRoll(exposure.infectionRoll) ||
      (exposure.infectionAtRisk !== undefined && typeof exposure.infectionAtRisk !== 'boolean') ||
      (exposure.openedTier !== undefined &&
        (!Number.isInteger(exposure.openedTier) ||
          exposure.openedTier < 0 ||
          exposure.openedTier >= this.tuning.bleeding.tiers.length)) ||
      exposure.sources.length === 0
    ) {
      throw new Error('Invalid damage exposure');
    }
    const ids = new Set<string>();
    for (const source of exposure.sources) {
      const linger = this.tuning.linger[exposure.kind];
      if (
        !(source.id && source.cause) ||
        ids.has(source.id) ||
        !Number.isFinite(source.rate) ||
        source.rate <= 0 ||
        (source.touch !== undefined && !TOUCHES.includes(source.touch)) ||
        (source.remaining !== undefined &&
          (!(linger && Number.isFinite(source.remaining)) ||
            source.remaining <= 0 ||
            source.remaining > linger.simSeconds))
      ) {
        throw new Error('Invalid exposure source');
      }
      ids.add(source.id);
    }
  }

  private nextId(): number {
    const id = this.state.nextId;
    this.state.nextId += 1;
    return id;
  }

  private exposure(region: BodyRegion, kind: DamageKind): DamageExposure {
    const existing = this.state.exposures.find((entry) => entry.region === region && entry.kind === kind);
    if (existing) {
      return existing;
    }
    const exposure: DamageExposure = {
      region,
      kind,
      damage: 0,
      roll: this.draw(this.nextId()),
      infectionRoll: this.draw(this.nextId()),
      sources: [],
    };
    this.state.exposures.push(exposure);
    return exposure;
  }

  contact({ id, rate, cause, region, kind, touch }: ExposureContact): void {
    if (!Number.isFinite(rate) || rate < 0) {
      throw new Error('Invalid exposure rate');
    }
    if (rate === 0) {
      this.leave(id);
      return;
    }
    const exposure = this.exposure(region, kind);
    const refreshed: ExposureSource = touch === undefined ? { id, rate, cause } : { id, rate, cause, touch };
    const index = exposure.sources.findIndex((entry) => entry.id === id);
    if (index >= 0) {
      exposure.sources[index] = refreshed;
    } else {
      exposure.sources.push(refreshed);
    }
  }

  leave(id: string): void {
    for (const exposure of this.state.exposures) {
      const linger = this.tuning.linger[exposure.kind];
      for (const source of exposure.sources) {
        if (source.id === id && source.remaining === undefined) {
          source.remaining = linger?.simSeconds ?? 0;
        }
      }
    }
    this.prune();
  }

  hit(
    amount: number,
    cause: string,
    region: BodyRegion,
    { kind, touch }: { readonly kind: DamageKind; readonly touch?: Touch | undefined },
  ): DamageExposure | undefined {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Invalid body damage');
    }
    const linger = this.tuning.linger[kind];
    if (!linger || amount === 0) {
      return undefined;
    }
    const exposure = this.exposure(region, kind);
    exposure.damage += amount;
    exposure.sources.push({
      id: `hit:${this.nextId()}`,
      cause,
      rate: amount / linger.simSeconds,
      remaining: linger.simSeconds,
      ...(touch && { touch }),
    });
    return exposure;
  }

  end(kind: DamageKind): void {
    this.state.exposures = this.state.exposures.filter((exposure) => exposure.kind !== kind);
  }

  advance(
    seconds: number,
    apply: (amount: number, cause: string, exposure: DamageExposure, touch: Touch | undefined) => void,
    blocked: (exposure: DamageExposure, touch: Touch | undefined) => boolean = () => false,
  ): void {
    if (!Number.isFinite(seconds) || seconds < 0) {
      throw new Error('Invalid exposure step');
    }
    this.state.simTimestamp += seconds;
    for (const exposure of this.state.exposures) {
      for (const source of exposure.sources) {
        const amount = sourceDamage(source, seconds, this.tuning.linger[exposure.kind]?.simSeconds);
        // A blocked source still runs down its tail, so taking the protection off mid-tail harms only for the rest.
        if (amount > 0 && !blocked(exposure, source.touch)) {
          exposure.damage += amount;
          apply(amount, source.cause, exposure, source.touch);
        }
      }
    }
    this.prune();
  }

  private prune(): void {
    for (const exposure of this.state.exposures) {
      exposure.sources = exposure.sources.filter((source) => source.remaining === undefined || source.remaining > 0);
    }
    this.state.exposures = this.state.exposures.filter((exposure) => exposure.sources.length > 0);
  }
}
