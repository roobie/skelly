import type { PortDef } from '../core/schema.ts';

/** Generic attachment faces. Future accessories use these interfaces, not optic-specific ports. */
export const MOUNT_KINDS = ['rail-top', 'rail-side', 'rail-bottom', 'muzzle'] as const;
export type MountKind = (typeof MOUNT_KINDS)[number];

export interface MountStandard {
  readonly family: 'slotted-rail' | 'thread';
  /** Contact width available to an attachment, in gungen units. */
  readonly contactWidthU: number;
  /** Slot spacing for rail interfaces; omitted for continuous thread interfaces. */
  readonly slotPitchU?: number;
}

/** Mount specifications are data so future parts can declare compatible interfaces. */
export const MOUNT_STANDARDS: Readonly<Record<MountKind, MountStandard>> = {
  'rail-top': { family: 'slotted-rail', contactWidthU: 1.75, slotPitchU: 2 },
  'rail-side': { family: 'slotted-rail', contactWidthU: 1.75, slotPitchU: 2 },
  'rail-bottom': { family: 'slotted-rail', contactWidthU: 1.75, slotPitchU: 2 },
  muzzle: { family: 'thread', contactWidthU: 0 },
};

export interface MountRequirement {
  readonly kind: MountKind;
  readonly contactLengthU: number;
  readonly contactWidthU: number;
  readonly minimumSlots: number;
  readonly ringSpanU?: number;
  /** Conservative keep-clear distances around the interface, in U. */
  readonly clearanceU: { readonly forward: number; readonly rearward: number; readonly lateral: number };
}

export const railSpanU = (port: PortDef): number =>
  port.slots && port.slots.count > 1 ? (port.slots.count - 1) * port.slots.pitch : 0;

export const mountCanAccept = (port: PortDef, requirement: MountRequirement, slot = 0): boolean => {
  if (port.mount !== requirement.kind) {
    return false;
  }
  const standard = MOUNT_STANDARDS[requirement.kind];
  return (
    standard.family !== 'slotted-rail' ||
    (port.slots !== undefined &&
      port.slots.count >= requirement.minimumSlots &&
      (standard.slotPitchU === undefined || Math.abs(port.slots.pitch - standard.slotPitchU) <= 1e-9) &&
      railSpanU(port) + 1e-9 >= requirement.contactLengthU &&
      (requirement.ringSpanU === undefined || railSpanU(port) + 1e-9 >= requirement.ringSpanU) &&
      requirement.contactWidthU <= standard.contactWidthU + 1e-9 &&
      slot * port.slots.pitch + 1e-9 >= Math.max(requirement.contactLengthU, requirement.ringSpanU ?? 0) / 2 &&
      railSpanU(port) - slot * port.slots.pitch + 1e-9 >= Math.max(requirement.contactLengthU, requirement.ringSpanU ?? 0) / 2)
  );
};
