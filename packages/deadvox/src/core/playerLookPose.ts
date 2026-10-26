import type { FigureDef } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { PlayerStance } from './playerStance.ts';

const RADIANS = Math.PI / 180;

export const playerLookLean = (figure: FigureDef, pitch: number, stance: PlayerStance): number => {
  const { startPitchDegrees, torsoForwardDegrees } = figure.lookDownLean;
  const progress = Math.max(0, Math.min(1, (-pitch / RADIANS - startPitchDegrees) / (90 - startPitchDegrees)));
  const stanceLean = stance === 'standing' ? 0 : figure.stancePoses[stance].torsoForwardDegrees;
  // A prone torso is already horizontal; looking down must not fold it through the ground.
  return Math.min(torsoForwardDegrees * progress, Math.max(0, 90 - stanceLean)) * RADIANS;
};

export const playerEyePosition = ({
  feet,
  eyeHeightMetres,
  blockSize,
  yaw,
  pitch,
  stance,
  figure,
}: {
  feet: Readonly<Vec3>;
  eyeHeightMetres: number;
  blockSize: number;
  yaw: number;
  pitch: number;
  stance: PlayerStance;
  figure: FigureDef;
}): Vec3 => {
  const lean = playerLookLean(figure, pitch, stance);
  const hip = figure.hipHeightMetres - (stance === 'standing' ? 0 : figure.stancePoses[stance].hipDropMetres);
  const aboveHip = eyeHeightMetres - hip;
  const forward = (aboveHip * Math.sin(lean)) / blockSize;
  return [
    feet[0] - Math.sin(yaw) * forward,
    feet[1] + (eyeHeightMetres + aboveHip * (Math.cos(lean) - 1)) / blockSize,
    feet[2] - Math.cos(yaw) * forward,
  ];
};
