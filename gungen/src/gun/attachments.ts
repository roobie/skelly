import { localSolidBounds } from '../core/geometry.ts';
import { applyDir, applyPoint, type Vec3 } from '../core/math.ts';
import type { Resolved } from '../core/resolve.ts';
import type { PartDef } from '../core/schema.ts';
import { attachmentMassKg } from './attachmentMass.ts';
import { MOUNT_STANDARDS, type MountKind } from './mounts.ts';
import { getOptic, opticRailContactSolids, OPTIC_TYPE_IDS } from './optics.ts';

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
  readonly railSpanNotches?: { readonly minOffset: number; readonly maxOffset: number };
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

type AttachmentCoreMetadata = Omit<AttachmentMetadata, 'mountFrame'>;

export interface AttachmentMetadata {
  readonly id: string;
  readonly kind: AttachmentKind;
  readonly mount: MountKind;
  /** Local connector frame of the standalone attachment model; its normal opposes the firearm slot normal. */
  readonly mountFrame: { readonly normal: Vec3; readonly up: Vec3 };
  readonly massKg: number;
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
  /** Rail identity shared by its per-notch slots; omitted for muzzle interfaces. */
  readonly railId?: string;
  /** Zero-based notch on `railId`; omitted for muzzle interfaces. */
  readonly notchIndex?: number;
}

interface ResolvedAttachmentSlot {
  readonly id: string;
  readonly mount: MountKind;
  readonly position: Vec3;
  readonly direction: Vec3;
  readonly up: Vec3;
  readonly railId?: string;
  readonly notchIndex?: number;
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

export const attachmentMountSlot = (resolved: Resolved, partId: string, mount: MountKind): string | undefined => {
  for (const { conn, from, to } of resolved.connections) {
    if (from.part === partId) {
      if (from.port.gender === 'male' && from.port.mount === mount && to.port.gender === 'female') {
        return `${to.part}.${to.port.id}.0`;
      }
      continue;
    }
    if (to.part === partId && to.port.gender === 'male' && to.port.mount === mount && from.port.gender === 'female') {
      return `${from.part}.${from.port.id}.${conn.slot ?? 0}`;
    }
  }
  return undefined;
};

const railSpanNotches = (part: PartDef | undefined, mount: MountKind, solids = part?.solids) => {
  const pitch = MOUNT_STANDARDS[mount].slotPitchU;
  if (pitch === undefined || !part || !solids) {
    return;
  }
  const port = part.ports.find(({ gender, mount: portMount }) => gender === 'male' && portMount === mount);
  if (!port) {
    return;
  }
  const bounds = solids.map(localSolidBounds);
  if (bounds.length === 0) {
    throw new Error(`Rail attachment ${part.family} has no solids to define its span`);
  }
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const [low, high] of bounds) {
    for (const x of [low[0], high[0]]) {
      for (const y of [low[1], high[1]]) {
        for (const z of [low[2], high[2]]) {
          const offset =
            (x - port.pos[0]) * port.up[0] + (y - port.pos[1]) * port.up[1] + (z - port.pos[2]) * port.up[2];
          min = Math.min(min, offset);
          max = Math.max(max, offset);
        }
      }
    }
  }
  // Include every half-pitch notch cell the solid overlaps, not only notch centres inside it.
  return {
    minOffset: Math.floor(min / pitch + 0.5),
    maxOffset: Math.ceil(max / pitch + 0.5) - 1,
  };
};

export const attachmentSlots = (resolved: Resolved): ResolvedAttachmentSlot[] =>
  [...resolved.defs.entries()].flatMap(([partId, definition]) => {
    if (definition.tags?.includes('attachment')) {
      return [];
    }
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
            ...(port.mount === 'muzzle' ? {} : { railId: `${partId}.${port.id}`, notchIndex: index }),
          },
        ];
      });
    });
  });

const opticMetadata = (
  params: Readonly<Record<string, string>> | undefined,
  metresPerUnit: number,
  part?: PartDef,
): AttachmentCoreMetadata => {
  const optic = getOptic(params?.type, params?.mountSection);
  const span = railSpanNotches(part, optic.mount.kind, part ? opticRailContactSolids(part.solids) : undefined);
  if (!part) {
    throw new Error(`Optic ${optic.id} has no geometry for mass metadata`);
  }
  return {
    id: `optic-${optic.id}`,
    kind: 'optic',
    massKg: attachmentMassKg('sight', part, metresPerUnit, `optic-${optic.id}`),
    mount: optic.mount.kind,
    properties: {
      reticleKind: optic.reticleKind,
      ...(optic.magnification === undefined ? {} : { magnification: optic.magnification }),
      ...(span ? { railSpanNotches: span } : {}),
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
};

const railFrontSightMetadata = (metresPerUnit: number, part?: PartDef): AttachmentCoreMetadata => {
  const axis = part?.axes.find(({ kind }) => kind === 'sight');
  const span = railSpanNotches(part, 'rail-top');
  if (!part) {
    throw new Error('Front sight has no geometry for mass metadata');
  }
  return {
    id: 'rail-front-sight',
    kind: 'iron-sight',
    massKg: attachmentMassKg('rail-front-sight', part, metresPerUnit, 'rail-front-sight'),
    mount: 'rail-top',
    properties: span ? { railSpanNotches: span } : {},
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
};

const suppressorMetadata = (
  params: Readonly<Record<string, string>> | undefined,
  part: PartDef | undefined,
  metresPerUnit: number,
): AttachmentCoreMetadata | undefined => {
  const type = params?.type as keyof typeof suppressors | undefined;
  const properties = type && suppressors[type];
  if (!properties) {
    return undefined;
  }
  if (!part) {
    throw new Error(`Suppressor ${type} has no geometry for mass metadata`);
  }
  return {
    id: type,
    kind: 'suppressor',
    mount: 'muzzle',
    massKg: attachmentMassKg('suppressor', part, metresPerUnit, type),
    properties,
  };
};

const flashlightMountMetadata = (part: PartDef | undefined, metresPerUnit: number): AttachmentCoreMetadata => {
  const span = railSpanNotches(part, 'rail-side');
  if (!part) {
    throw new Error('Flashlight mount has no geometry for mass metadata');
  }
  return {
    id: 'tactical-flashlight-mount',
    kind: 'flashlight-mount',
    massKg: attachmentMassKg('tactical-flashlight-mount', part, metresPerUnit, 'tactical-flashlight-mount'),
    mount: 'rail-side',
    properties: span ? { railSpanNotches: span } : {},
  };
};

const foregripMetadata = (part: PartDef | undefined, metresPerUnit: number): AttachmentCoreMetadata => {
  const span = railSpanNotches(part, 'rail-bottom');
  if (!part) {
    throw new Error('Foregrip has no geometry for mass metadata');
  }
  return {
    id: 'foregrip',
    kind: 'foregrip',
    massKg: attachmentMassKg('foregrip', part, metresPerUnit, 'foregrip'),
    mount: 'rail-bottom',
    properties: { handlingClass: 'vertical', ...(span ? { railSpanNotches: span } : {}) },
  };
};

export const attachmentMetadata = (
  family: string,
  params: Readonly<Record<string, string>> | undefined,
  metresPerUnit: number,
  part?: PartDef,
): AttachmentMetadata | undefined => {
  const metadata = (() => {
    switch (family) {
      case 'sight':
        return opticMetadata(params, metresPerUnit, part);
      case 'rail-front-sight':
        return railFrontSightMetadata(metresPerUnit, part);
      case 'suppressor':
        return suppressorMetadata(params, part, metresPerUnit);
      case 'tactical-flashlight-mount':
        return flashlightMountMetadata(part, metresPerUnit);
      case 'foregrip':
        return foregripMetadata(part, metresPerUnit);
      default:
        return;
    }
  })();
  if (!metadata) {
    return undefined;
  }
  const port = part?.ports.find(({ gender, mount }) => gender === 'male' && mount === metadata.mount);
  if (!port) {
    throw new Error(`Attachment ${metadata.id} has no male ${metadata.mount} connector`);
  }
  return { ...metadata, mountFrame: { normal: port.normal, up: port.up } };
};
