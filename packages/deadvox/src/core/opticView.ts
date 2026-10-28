import { type OpticAperture, opticApertureDistance } from '@skelly/thing-core/optic-aperture';
import type { Reticle } from '@skelly/thing-core/reticle';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import type { Item } from './items.ts';
import type { ItemDef, ModelDef } from './schema.ts';

export interface OpticViewSettings {
  readonly magnification: number;
  readonly worldAtUnity: boolean;
  readonly aperture: OpticAperture;
  readonly reticle?: Reticle;
}

export interface OpticZoomFrame {
  readonly uid: number;
  readonly opticUid: number;
  readonly magnification: number;
}

export const mountedOptic = (
  registry: Pick<Registry, 'items' | 'models'>,
  firearm: Item,
): { uid: number; slot: string; item: ItemDef; model: ModelDef } | undefined => {
  for (const [slot, child] of Object.entries(firearm.slots ?? {})) {
    const item = registry.items.get(child.type);
    const model = item?.model === undefined ? undefined : registry.models.get(item.model);
    if (item && model?.gun?.attachment?.kind === 'optic') {
      return { uid: child.uid, slot, item, model };
    }
  }
  return undefined;
};

/** The optic a firearm presents while aiming down sights, with its view settings at the current zoom. */
export const presentedOptic = (
  registry: Pick<Registry, 'items' | 'models'>,
  {
    item,
    modelDefinition,
    aimingDownSights,
    zoom,
  }: {
    readonly item: Item;
    readonly modelDefinition: ModelDef | undefined;
    readonly aimingDownSights: boolean;
    readonly zoom: OpticZoomFrame | undefined;
  },
): { slot: string; settings: OpticViewSettings } | undefined => {
  const optic = mountedOptic(registry, item);
  const base = optic && opticViewSettings(optic.item, optic.model);
  if (!(optic && base && aimingDownSights && modelDefinition?.gun?.sight?.kind === 'optic')) {
    return undefined;
  }
  const zoomed = zoom?.uid === item.uid && zoom.opticUid === optic.uid;
  return { slot: optic.slot, settings: zoomed ? { ...base, magnification: zoom.magnification } : base };
};

export interface LensAperture {
  readonly center: readonly [number, number];
  readonly radius: readonly [number, number];
}

export interface OpticLensFrame extends LensAperture, OpticViewSettings {
  /** Where the sight direction meets the image, in the same UV space as `center`. */
  readonly reticleCenter: readonly [number, number];
}

export const opticRendersWorld = (frame: OpticViewSettings): boolean => frame.magnification > 1 || frame.worldAtUnity;

export const opticFieldOfView = (verticalFovDegrees: number, magnification: number): number => {
  if (!(verticalFovDegrees > 0 && verticalFovDegrees < 180 && magnification > 0)) {
    throw new RangeError('Invalid optic field of view');
  }
  const halfAngle = (verticalFovDegrees * Math.PI) / 360;
  return (2 * Math.atan(Math.tan(halfAngle) / magnification) * 180) / Math.PI;
};

/** Resolves authored view tuning against the optic model's exported physical magnification data. */
export const opticViewSettings = (item: ItemDef, { gun }: ModelDef): OpticViewSettings | undefined => {
  const attachment = gun?.attachment;
  if (attachment?.kind !== 'optic') {
    return undefined;
  }
  const { aperture } = attachment.properties;
  if (!aperture || item.opticUnityImage === undefined) {
    return undefined;
  }
  const range = attachment.properties.magnification;
  if (range && range.min < range.max && (item.opticMagnification === undefined || item.opticZoom === undefined)) {
    return undefined;
  }
  const magnification = item.opticMagnification ?? range?.min ?? 1;
  return {
    magnification,
    worldAtUnity: item.opticUnityImage === 'world',
    aperture,
    ...(attachment.properties.reticle === undefined ? {} : { reticle: attachment.properties.reticle }),
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

/**
 * Projects the sight direction through the image camera. The reticle marks aim on the world image, so it must not
 * follow the finite glass centre, which shifts with the instrument relative to the eye.
 */
export const projectOpticReticle = (
  direction: Vec3,
  verticalFovDegrees: number,
  aspect: number,
  magnification: number,
): readonly [number, number] | undefined => {
  const ndc = project(direction, opticFieldOfView(verticalFovDegrees, magnification), aspect);
  return ndc ? [(ndc[0] + 1) / 2, (ndc[1] + 1) / 2] : undefined;
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

/** The pixel-space profile predicate shared by lens clip tests and its shader counterpart. */
export const insideLensAperture = (
  point: readonly [number, number],
  aperture: LensAperture,
  shape: OpticAperture,
): boolean => {
  const [rx, ry] = aperture.radius;
  if (!(rx > 0 && ry > 0)) {
    return false;
  }
  const dx = (point[0] - aperture.center[0]) / rx;
  const dy = (point[1] - aperture.center[1]) / ry;
  return opticApertureDistance(dx, dy, shape) <= 1;
};
