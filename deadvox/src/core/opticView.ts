import type { Vec3 } from './coords.ts';
import type { ItemDef, ModelDef } from './schema.ts';

export type ReticleKind = 'dot' | 'crosshair' | 'chevron';

export interface OpticViewSettings {
  readonly magnification: number;
  readonly reticleKind?: ReticleKind;
}

export interface LensAperture {
  readonly center: readonly [number, number];
  readonly radius: readonly [number, number];
}

export interface OpticLensFrame extends LensAperture, OpticViewSettings {}

export const opticFieldOfView = (verticalFovDegrees: number, magnification: number): number => {
  if (!(verticalFovDegrees > 0 && verticalFovDegrees < 180 && magnification > 0)) {
    throw new RangeError('Invalid optic field of view');
  }
  const halfAngle = (verticalFovDegrees * Math.PI) / 360;
  return (2 * Math.atan(Math.tan(halfAngle) / magnification) * 180) / Math.PI;
};

/** Resolves authored view tuning against the optic model's exported physical magnification data. */
export const opticViewSettings = (item: ItemDef, { attachment }: ModelDef): OpticViewSettings | undefined => {
  if (attachment?.kind !== 'optic') {
    return undefined;
  }
  const range = attachment.properties.magnification;
  if (range && range.min < range.max && item.opticMagnification === undefined) {
    return undefined;
  }
  const magnification = item.opticMagnification ?? range?.min ?? 1;
  return {
    magnification,
    ...(attachment.properties.reticleKind === undefined ? {} : { reticleKind: attachment.properties.reticleKind }),
  };
};

const project = (point: Vec3, verticalFovDegrees: number, aspect: number): readonly [number, number] | undefined => {
  const depth = -point[2];
  if (!(depth > 0 && aspect > 0 && verticalFovDegrees > 0 && verticalFovDegrees < 180)) {
    return undefined;
  }
  const halfHeight = depth * Math.tan((verticalFovDegrees * Math.PI) / 360);
  return [point[0] / (halfHeight * aspect), point[1] / halfHeight];
};

/** Projects the exported ocular circle from the same camera-local frame as the held optic window. */
export interface ProjectLensApertureInput {
  readonly center: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly radius: number;
  readonly verticalFovDegrees: number;
  readonly aspect: number;
}

export const projectLensAperture = ({
  center,
  right,
  up,
  radius,
  verticalFovDegrees,
  aspect,
}: ProjectLensApertureInput): LensAperture | undefined => {
  if (!(Number.isFinite(radius) && radius > 0)) {
    return undefined;
  }
  const centerNdc = project(center, verticalFovDegrees, aspect);
  const rightNdc = project(
    [center[0] + right[0] * radius, center[1] + right[1] * radius, center[2] + right[2] * radius],
    verticalFovDegrees,
    aspect,
  );
  const upNdc = project(
    [center[0] + up[0] * radius, center[1] + up[1] * radius, center[2] + up[2] * radius],
    verticalFovDegrees,
    aspect,
  );
  if (!(centerNdc && rightNdc && upNdc)) {
    return undefined;
  }
  return {
    center: [(centerNdc[0] + 1) / 2, (centerNdc[1] + 1) / 2],
    radius: [Math.abs(rightNdc[0] - centerNdc[0]) / 2, Math.abs(upNdc[1] - centerNdc[1]) / 2],
  };
};

/** The pixel-space ellipse predicate shared by lens clip tests and its shader counterpart. */
export const insideLensAperture = (point: readonly [number, number], aperture: LensAperture): boolean => {
  const [rx, ry] = aperture.radius;
  if (!(rx > 0 && ry > 0)) {
    return false;
  }
  const dx = (point[0] - aperture.center[0]) / rx;
  const dy = (point[1] - aperture.center[1]) / ry;
  return dx * dx + dy * dy <= 1;
};
