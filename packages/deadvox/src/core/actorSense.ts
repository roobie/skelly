import type { SensedLightSource } from './agentPerception.ts';

import type { Vec3 } from './coords.ts';
import type { Body } from './physics.ts';
import type { PlayerStance } from './playerStance.ts';

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
