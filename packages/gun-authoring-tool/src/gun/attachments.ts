import type { PartAppearance, PartDef, PartInstance, PortDef, Resolved } from '@skelly/engine/assembly/schema.ts';
import { applyDir, applyPoint, type Vec3 } from '@skelly/engine/foundation/math.ts';
import { localSolidBounds } from '@skelly/engine/shapes/geometry.ts';
import { MATERIALS } from '@skelly/thing-core/materials';
import appearanceContent from './appearance.json' with { type: 'json' };
import { MOUNT_STANDARDS, type MountKind } from './mounts.ts';
import { getOptic, LENS_SLOT, OPTIC_TYPE_IDS, opticRailContactSolids } from './optics.ts';

type AttachmentKind = 'optic' | 'iron-sight' | 'suppressor' | 'muzzle-device' | 'flashlight-mount' | 'foregrip';

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
  'real-suppressor': { noiseFactor: 0.25, wearClass: 'real' },
  'improvised-suppressor': { noiseFactor: 0.7, wearClass: 'improvised' },
} as const;

const akMuzzleDevices = {
  'ak-slant-compensator': 'slant',
  'ak74-muzzle-brake': 'ak74',
} as const;

export const ATTACHMENT_IDS = [
  ...OPTIC_TYPE_IDS.map((id) => `optic-${id}`),
  'rail-front-sight',
  'real-suppressor',
  'improvised-suppressor',
  'ak-slant-compensator',
  'ak74-muzzle-brake',
  'tactical-flashlight-mount',
  'foregrip',
] as const;

const looks: Readonly<Record<string, { readonly appearance?: PartAppearance; readonly voxelGrain?: number }>> =
  appearanceContent.attachments;

/** Finish slots no gun or role finish fills, so the attachment's look must select them: an optic's lens coating. */
const requiredSlots = (id: string): readonly string[] => (id.startsWith('optic-') ? [LENS_SLOT] : []);

/**
 * Why an attachment's finish cannot be drawn: a required slot it leaves unselected, or a material that does not exist.
 * Without this, an optic whose coating is missing from content would draw its lens in the sight role's opaque metal
 * and no one would be told.
 */
export const attachmentLookIssue = (id: string, finish: Readonly<Record<string, string>>): string | undefined => {
  const missing = requiredSlots(id).find((slot) => !Object.hasOwn(finish, slot));
  if (missing !== undefined) {
    return `Attachment ${id} needs a ${missing} finish in appearance content attachments`;
  }
  const unknown = Object.entries(finish).find(([, material]) => !Object.hasOwn(MATERIALS, material));
  return unknown && `Attachment ${id} ${unknown[0]} finish ${unknown[1]} is not a material`;
};

/**
 * The attachment's authored finish with an instance's own finish over it slot by slot, so an instance that varies one
 * slot (an optic's lens coating, say) keeps the product's other defaults.
 */
const withDefaultLook = (id: string, appearance: PartAppearance | undefined): PartAppearance => {
  const finish = { ...(Object.hasOwn(looks, id) ? looks[id]!.appearance?.finish : undefined), ...appearance?.finish };
  const issue = attachmentLookIssue(id, finish);
  if (issue !== undefined) {
    throw new Error(issue);
  }
  return Object.keys(finish).length === 0 ? {} : { finish };
};

for (const id of ATTACHMENT_IDS) {
  withDefaultLook(id, undefined);
}

export const attachmentInstanceForId = (
  id: string,
  appearance?: PartAppearance,
): PartInstance & { readonly params: Readonly<Record<string, string>> } => {
  if (!ATTACHMENT_IDS.includes(id as (typeof ATTACHMENT_IDS)[number])) {
    throw new Error(`Unknown attachment id: ${id}`);
  }
  const instanceAppearance = withDefaultLook(id, appearance);
  if (id.startsWith('optic-')) {
    return { family: 'sight', params: { type: id.slice('optic-'.length) }, appearance: instanceAppearance };
  }
  if (id === 'real-suppressor' || id === 'improvised-suppressor') {
    return { family: 'suppressor', params: { type: id }, appearance: instanceAppearance };
  }
  if (id === 'ak-slant-compensator' || id === 'ak74-muzzle-brake') {
    return { family: 'ak-muzzle-device', params: { style: akMuzzleDevices[id] }, appearance: instanceAppearance };
  }
  return { family: id, params: {}, appearance: instanceAppearance };
};

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

// The resolver accepts integer indices below a fractional slot count, so enumerate them with ceil too.
const railNotchCount = (port: Pick<PortDef, 'slots'>): number => Math.ceil(port.slots?.count ?? 1);

/** Whether an attachment seated on a notch keeps its whole rail span on the rail's notches. */
export const railSpanFitsNotch = (
  span: AttachmentProperties['railSpanNotches'],
  notchIndex: number,
  hostPort: Pick<PortDef, 'slots'>,
): boolean => !span || (notchIndex + span.minOffset >= 0 && notchIndex + span.maxOffset < railNotchCount(hostPort));

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
      const count = railNotchCount(port);
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
    mount: 'rail-top',
    properties: span ? { railSpanNotches: span } : {},
    ...(axis?.referenceDistanceU === undefined
      ? {}
      : {
          sight: {
            kind: 'iron',
            eye: [axis.origin[0] * metresPerUnit, axis.origin[1] * metresPerUnit, axis.origin[2] * metresPerUnit],
            direction: axis.dir,
            up: [0, 1, 0],
            eyeReliefMetres: axis.referenceDistanceU * metresPerUnit,
          },
        }),
  };
};

const suppressorMetadata = (
  params: Readonly<Record<string, string>> | undefined,
  part: PartDef | undefined,
): AttachmentCoreMetadata | undefined => {
  const type = params?.type as keyof typeof suppressors | undefined;
  const properties = type && suppressors[type];
  if (!properties) {
    return undefined;
  }
  if (!part) {
    throw new Error(`Suppressor ${type} has no geometry for attachment metadata`);
  }
  return {
    id: type,
    kind: 'suppressor',
    mount: 'muzzle',
    properties,
  };
};

const akMuzzleDeviceMetadata = (
  params: Readonly<Record<string, string>> | undefined,
  part: PartDef | undefined,
): AttachmentCoreMetadata | undefined => {
  const id = Object.entries(akMuzzleDevices).find(([, style]) => style === params?.style)?.[0];
  if (!id) {
    return undefined;
  }
  if (!part) {
    throw new Error(`Muzzle device ${id} has no geometry for attachment metadata`);
  }
  return { id, kind: 'muzzle-device', mount: 'muzzle', properties: {} };
};

const flashlightMountMetadata = (part: PartDef | undefined): AttachmentCoreMetadata => {
  const span = railSpanNotches(part, 'rail-side');
  if (!part) {
    throw new Error('Flashlight mount has no geometry for attachment metadata');
  }
  return {
    id: 'tactical-flashlight-mount',
    kind: 'flashlight-mount',
    mount: 'rail-side',
    properties: span ? { railSpanNotches: span } : {},
  };
};

const foregripMetadata = (part: PartDef | undefined): AttachmentCoreMetadata => {
  const span = railSpanNotches(part, 'rail-bottom');
  if (!part) {
    throw new Error('Foregrip has no geometry for attachment metadata');
  }
  return {
    id: 'foregrip',
    kind: 'foregrip',
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
        return suppressorMetadata(params, part);
      case 'ak-muzzle-device':
        return akMuzzleDeviceMetadata(params, part);
      case 'tactical-flashlight-mount':
        return flashlightMountMetadata(part);
      case 'foregrip':
        return foregripMetadata(part);
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

export const withAttachmentInstanceAppearances = (resolved: Resolved): Resolved => {
  let parts: Record<string, PartInstance> | undefined;
  for (const [id, definition] of resolved.defs) {
    const instance = resolved.assembly.parts[id];
    if (!instance) {
      continue;
    }
    const params = resolved.params.get(id);
    const metadata = attachmentMetadata(
      instance.family,
      params && Object.fromEntries(Object.entries(params).map(([name, value]) => [name, value.value])),
      resolved.domain.units.metresPerUnit,
      definition,
    );
    if (!metadata) {
      continue;
    }
    parts ??= { ...resolved.assembly.parts };
    parts[id] = { ...instance, appearance: withDefaultLook(metadata.id, instance.appearance) };
  }
  return parts ? { ...resolved, assembly: { ...resolved.assembly, parts } } : resolved;
};
