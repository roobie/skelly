import type { Vec3 } from './coords.ts';
import type { DayPhase } from './dayPhase.ts';
import type { Body } from './physics.ts';
import type { PlayerStance } from './playerStance.ts';
import type { Rng } from './random.ts';
import type { SolidAt } from './raycast.ts';
import type { ActorDef, SenseDef } from './schema.ts';

export type PlayerMovement = 'walking' | 'jogging' | 'sprinting' | 'still';
export interface VocalNoise {
  id: number;
  pos: Vec3;
  radiusMetres: number;
  expiresAt: number;
}
export interface PlayerSense {
  pos: Vec3;
  /** When present, the solid player box used for hard movement collisions. */
  body?: Body | undefined;
  /** Direction the player faces, in the x/z plane. */
  facing: Vec3;
  movement: PlayerMovement;
  stance?: PlayerStance | undefined;
  lit: boolean;
  lightSeenFrom: number;
  /** Also the height of the light the player carries. */
  eyeHeightMetres: number;
  /** Direct sunlight at the player's position; omitted by isolated perception fixtures. */
  sunlit?: boolean | undefined;
  lightSources?: readonly SensedLightSource[] | undefined;
  vocalNoise?: VocalNoise | undefined;
}
export interface SensedLightSource {
  pos: Vec3;
  seenFrom: number;
  heightMetres: number;
  /** Direct sunlight at the source; omitted by isolated perception fixtures. */
  sunlit?: boolean | undefined;
  /** Player-carried light uses the darkness gate; independent sources use lure tuning. */
  carried: boolean;
}
export interface PerceptionInput {
  def: ActorDef;
  from: Vec3;
  facing: Vec3;
  player: PlayerSense;
  dayPhase: DayPhase;
  sightBlend: number;
  blockSize: number;
  isSolid: SolidAt;
  isSunExposedAt?: ((position: Vec3) => boolean) | undefined;
  tuning: SenseDef;
}
export interface HearingInput {
  def: ActorDef;
  from: Vec3;
  player: PlayerSense;
  blockSize: number;
  isSolid: SolidAt;
  rng: Rng;
  tuning: SenseDef;
}
export type HearingTier = 'near' | 'far';
export interface HeardNoise {
  tier: HearingTier;
  target: Vec3;
}
