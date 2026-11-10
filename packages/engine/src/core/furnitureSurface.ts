import type { Vec3 } from './coords.ts';

export const furnitureSurfacePosition = ({ pos, size }: { pos: Readonly<Vec3>; size: Readonly<Vec3> }): Vec3 => [
  pos[0] + Math.floor(size[0] / 2),
  pos[1] + size[1],
  pos[2] + Math.floor(size[2] / 2),
];
