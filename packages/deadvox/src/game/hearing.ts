// What a listener hears of a sound that starts playing: occlusion, distance and the heard record.
// No browser API; voice caps are in `voiceCaps.ts`.
import type { Vec3 } from '../core/coords.ts';
import type { SolidAt } from '../core/raycast.ts';
import type { SenseDef, SoundDef } from '../core/schema.ts';
import type { SoundId } from '../core/soundEvents.ts';
import { soundOcclusion } from '../core/soundOcclusion.ts';

const RECENT_SOUNDS = 8;

export interface HeardSound {
  readonly event: SoundId;
  readonly file: string;
  readonly sourceLabel: string | null;
  readonly distanceMetres: number;
  readonly occluded: boolean;
  readonly lowpassHz: number | null;
  /** Combined sample, occlusion, saved master/category settings, and inverse-distance gain. */
  readonly gain: number;
  readonly emittedAsNoise: boolean;
  readonly noiseRadiusMetres: number | null;
}

/** How one sound reaches the listener. */
export interface Audibility {
  /** Heard at the head, unfiltered and unpanned: listener-relative or interface sounds. */
  readonly headLocked: boolean;
  readonly occluded: boolean;
  /** Occlusion gain. */
  readonly gain: number;
  readonly cutoffHz: number;
  readonly distanceMetres: number;
  readonly distanceGain: number;
}

export interface HeardStart {
  readonly event: SoundId;
  readonly sound: SoundDef;
  readonly file: string;
  /** The picked sample gain. */
  readonly pickGain: number;
  readonly audibility: Audibility;
  /** The listener's saved master and category volumes. */
  readonly masterVolume: number;
  readonly categoryVolume: number;
  readonly emittedAsNoise: boolean;
  readonly sourceLabel: string | null;
}

export interface HearingOptions {
  readonly blockSize: number;
  readonly isSolid: SolidAt;
  readonly tuning: SenseDef;
}

export class Hearing {
  private listenerPosition: Vec3 = [0, 0, 0];
  private readonly recentSounds: HeardSound[] = [];
  private readonly blockSize: number;
  private readonly isSolid: SolidAt;
  private readonly tuning: SenseDef;

  constructor({ blockSize, isSolid, tuning }: HearingOptions) {
    this.blockSize = blockSize;
    this.isSolid = isSolid;
    this.tuning = tuning;
  }

  get listener(): Vec3 {
    return [...this.listenerPosition];
  }

  moveListener(positionMetres: Vec3): void {
    this.listenerPosition = [...positionMetres];
  }

  get heardSounds(): readonly HeardSound[] {
    return [...this.recentSounds];
  }

  audibility(sound: SoundDef, positionMetres: Vec3, listenerRelative: boolean): Audibility {
    const headLocked = listenerRelative || sound.category === 'ui';
    if (headLocked) {
      return {
        headLocked,
        occluded: false,
        gain: 1,
        cutoffHz: Number.POSITIVE_INFINITY,
        distanceMetres: 0,
        distanceGain: 1,
      };
    }
    const listenerBlocks: Vec3 = this.listenerPosition.map((v) => v / this.blockSize) as Vec3;
    const sourceBlocks: Vec3 = positionMetres.map((v) => v / this.blockSize) as Vec3;
    const occlusion = soundOcclusion({
      listener: listenerBlocks,
      source: sourceBlocks,
      isSolid: this.isSolid,
      globalWall: this.tuning.wall,
      soundWall: sound.wall,
    });
    const distanceMetres = Math.hypot(
      positionMetres[0] - this.listenerPosition[0],
      positionMetres[1] - this.listenerPosition[1],
      positionMetres[2] - this.listenerPosition[2],
    );
    return {
      headLocked,
      occluded: occlusion.occluded,
      gain: occlusion.gain,
      cutoffHz: occlusion.cutoffHz,
      distanceMetres,
      distanceGain: 1 / Math.max(1, Math.min(64, distanceMetres)),
    };
  }

  /** Records a sound that has started playing; the newest few stay heard. */
  heard({
    event,
    sound,
    file,
    pickGain,
    audibility,
    masterVolume,
    categoryVolume,
    emittedAsNoise,
    sourceLabel,
  }: HeardStart): void {
    this.recentSounds.push({
      event,
      file,
      sourceLabel,
      distanceMetres: audibility.distanceMetres,
      occluded: audibility.occluded,
      lowpassHz: audibility.headLocked ? null : audibility.cutoffHz,
      gain: pickGain * audibility.gain * masterVolume * categoryVolume * audibility.distanceGain,
      emittedAsNoise,
      noiseRadiusMetres: emittedAsNoise && sound.noise.enabled ? sound.noise.radiusMetres : null,
    });
    if (this.recentSounds.length > RECENT_SOUNDS) {
      this.recentSounds.shift();
    }
  }
}
