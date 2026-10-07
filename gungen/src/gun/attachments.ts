import { applyDir, applyPoint, type Vec3 } from '../core/math.ts';
import type { Resolved } from '../core/resolve.ts';
import type { PartDef } from '../core/schema.ts';
import type { MountKind } from './mounts.ts';
import { getOptic, OPTIC_TYPE_IDS } from './optics.ts';

type AttachmentKind = 'optic' | 'iron-sight' | 'suppressor' | 'flashlight-mount' | 'foregrip';

interface MagnificationRange {
  readonly min: number;
  readonly max: number;
}

interface AttachmentProperties {
  readonly magnification?: MagnificationRange;
  readonly reticleKind?: 'dot' | 'crosshair' | 'chevron';
  readonly noiseFactor?: number;
  readonly wearClass?: 'real' | 'improvised';
  readonly handlingClass?: string;
}

interface AttachmentSightMetadata {
  readonly kind: 'optic' | 'iron';
  /** Ocular point relative to the attachment node, in metres. */
  readonly eye: Vec3;
  readonly direction: Vec3;
  readonly up: Vec3;
  readonly eyeReliefMetres: number;
  readonly ocularDiameterMetres?: number;
}

export interface AttachmentMetadata {
  readonly id: string;
  readonly kind: AttachmentKind;
  readonly mount: MountKind;
  readonly properties: AttachmentProperties;
  /** Local sight frame for runtime fitting; the host gun transform is applied by Deadvox. */
  readonly sight?: AttachmentSightMetadata;
}

export interface AttachmentSlotMetadata {
  readonly id: string;
  readonly mount: MountKind;
  /** Mount position in the exported gun frame, in metres. */
  readonly position: Vec3;
  readonly direction: Vec3;
  readonly up: Vec3;
}

interface ResolvedAttachmentSlot {
  readonly id: string;
  readonly mount: MountKind;
  readonly position: Vec3;
  readonly direction: Vec3;
  readonly up: Vec3;
}

const suppressors = {
  'real-suppressor': { noiseFactor: 0.45, wearClass: 'real' },
  'improvised-suppressor': { noiseFactor: 0.7, wearClass: 'improvised' },
} as const;

export const ATTACHMENT_IDS = [
  ...OPTIC_TYPE_IDS.map((id) => `optic-${id}`),
  'rail-front-sight',
  'real-suppressor',
  'improvised-suppressor',
  'tactical-flashlight-mount',
  'foregrip',
] as const;

const MOUNT_SET = new Set<MountKind>(['rail-top', 'rail-side', 'rail-bottom', 'muzzle']);

export const attachmentSlots = (resolved: Resolved): ResolvedAttachmentSlot[] =>
  [...resolved.defs.entries()].flatMap(([partId, definition]) => {
    const transform = resolved.placed.get(partId);
    if (!transform) {
      return [];
    }
    return definition.ports.flatMap((port) => {
      if (port.gender !== 'female' || !MOUNT_SET.has(port.mount as MountKind)) {
        return [];
      }
      // The resolver accepts integer indices below a fractional slot count, so enumerate them with ceil too.
      const count = Math.ceil(port.slots?.count ?? 1);
      return Array.from({ length: count }, (_, index) => index).flatMap((index) => {
        const id = `${partId}.${port.id}.${index}`;
        const localPosition = port.slots
          ? (port.pos.map((value, axis) => value + port.up[axis]! * index * port.slots!.pitch) as unknown as Vec3)
          : port.pos;
        return [
          {
            id,
            mount: port.mount as MountKind,
            position: applyPoint(transform, localPosition),
            direction: applyDir(transform, port.normal),
            up: applyDir(transform, port.up),
          },
        ];
      });
    });
  });

export const attachmentMetadata = (
  family: string,
  params: Readonly<Record<string, string>> | undefined,
  metresPerUnit: number,
  part?: PartDef,
): AttachmentMetadata | undefined => {
  if (family === 'sight') {
    const optic = getOptic(params?.type, params?.mountSection);
    return {
      id: `optic-${optic.id}`,
      kind: 'optic',
      mount: optic.mount.kind,
      properties: {
        reticleKind: optic.reticleKind,
        ...(optic.magnification === undefined ? {} : { magnification: optic.magnification }),
      },
      ...(optic.eyeReliefU === undefined
        ? {}
        : {
            sight: {
              kind: 'optic',
              eye: [optic.ocularX * metresPerUnit, optic.opticalAxisY * metresPerUnit, 0],
              direction: [1, 0, 0],
              up: [0, 1, 0],
              eyeReliefMetres: optic.eyeReliefU * metresPerUnit,
              ocularDiameterMetres: optic.ocularOpeningDiameterU * metresPerUnit,
            },
          }),
    };
  }
  if (family === 'rail-front-sight') {
    const axis = part?.axes.find(({ kind }) => kind === 'sight');
    return {
      id: 'rail-front-sight',
      kind: 'iron-sight',
      mount: 'rail-top',
      properties: {},
      ...(axis?.eyeReliefU === undefined
        ? {}
        : {
            sight: {
              kind: 'iron',
              eye: [axis.origin[0] * metresPerUnit, axis.origin[1] * metresPerUnit, axis.origin[2] * metresPerUnit],
              direction: axis.dir,
              up: [0, 1, 0],
              eyeReliefMetres: axis.eyeReliefU * metresPerUnit,
            },
          }),
    };
  }
  if (family === 'suppressor') {
    const type = params?.type as keyof typeof suppressors | undefined;
    const properties = type && suppressors[type];
    return properties ? { id: type, kind: 'suppressor', mount: 'muzzle', properties } : undefined;
  }
  if (family === 'tactical-flashlight-mount') {
    return { id: 'tactical-flashlight-mount', kind: 'flashlight-mount', mount: 'rail-side', properties: {} };
  }
  if (family === 'foregrip') {
    return { id: 'foregrip', kind: 'foregrip', mount: 'rail-bottom', properties: { handlingClass: 'vertical' } };
  }
  return undefined;
};
