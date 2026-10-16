import type { ModelDef } from './content.ts';
import type { Vec3 } from './coords.ts';

const rotateAround = (point: Vec3, pivot: Vec3, axis: Vec3, angle: number): Vec3 => {
  const offset = point.map((value, index) => value - pivot[index]!) as Vec3;
  const dot = offset.reduce((sum, value, index) => sum + value * axis[index]!, 0);
  const cross: Vec3 = [
    axis[1] * offset[2] - axis[2] * offset[1],
    axis[2] * offset[0] - axis[0] * offset[2],
    axis[0] * offset[1] - axis[1] * offset[0],
  ];
  return offset.map(
    (value, index) =>
      pivot[index]! +
      value * Math.cos(angle) +
      cross[index]! * Math.sin(angle) +
      axis[index]! * dot * (1 - Math.cos(angle)),
  ) as Vec3;
};

/** File-frame chamber seat; the crane carries every mouth, independent of the presentation-only loading angle. */
export const revolverChamberPoint = (
  data: NonNullable<ModelDef['revolver']>,
  chamber: number,
  aligned: number,
  open: number,
): Vec3 => {
  const { centre, chamberRadiusMetres, chamberZeroRadians, axis } = data.cylinder;
  const angle = chamberZeroRadians + ((chamber - aligned) * 2 * Math.PI) / data.chambers;
  const radial: Vec3 = [0, chamberRadiusMetres, 0];
  const point = centre.map(
    (value, index) => value + radial[index]! - (axis[index]! * data.ejector.strokeMetres) / 2,
  ) as Vec3;
  const rotated = rotateAround(point, centre, axis, angle);
  return rotateAround(rotated, data.crane.pivot, data.crane.axis, data.crane.openRadians * open);
};
