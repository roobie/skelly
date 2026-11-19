import { claimed } from './capabilities.ts';
import type { Registry } from './content.ts';
import type { Vec3 } from './coords.ts';
import { type Pose, rotatedPoint, rotationOf } from './orientation.ts';
import type { FurnitureDef } from './schema.ts';

/** The part of a piece a use names when it aims at the piece's power switch. */
export const POWER_SWITCH_PART = 'switch';

/**
 * The world boxes, in blocks, a housing's power switch fills in either pose, so what is picked does not depend on the
 * pose drawn. Instrument positions are blocks from the origin cell's centre in the housing's own axes, plus the look's
 * offset, as the run lamp's are (`src/core/sitePower.ts`, `emitterOf`).
 */
export const powerSwitchBoxes = (
  piece: Pose & { readonly pos: Readonly<Vec3> },
  furniture: FurnitureDef,
): { readonly min: Vec3; readonly max: Vec3 }[] => {
  const look = furniture.power?.instruments;
  if (!look?.switch) {
    return [];
  }
  const rotation = rotationOf(piece);
  const world = (local: Vec3): Vec3 =>
    rotatedPoint(local.map((value, axis) => value + look.offset[axis]! + 0.5) as Vec3, furniture.size, rotation).map(
      (value, axis) => value + piece.pos[axis]!,
    ) as Vec3;
  return [...look.switch.on, ...look.switch.off].map(({ position, size }) => {
    const [a, b] = [-0.5, 0.5].map((side) =>
      world(position.map((value, axis) => value + side * size[axis]!) as Vec3),
    ) as [Vec3, Vec3];
    return {
      min: a.map((value, axis) => Math.min(value, b[axis]!)) as Vec3,
      max: a.map((value, axis) => Math.max(value, b[axis]!)) as Vec3,
    };
  });
};

interface Issue {
  path: string;
  message: string;
}

/** On a housing with slot anchors, each slot's flag stands on its anchor's mount, so flags and mounts pair up. */
const flagMountIssues = (furniture: FurnitureDef): Issue[] =>
  (furniture.slotAnchors ?? []).flatMap(({ slot, flagMount }, index) => {
    const flagged = furniture.power?.instruments?.flags.some((flag) => flag.slot === slot) ?? false;
    if (flagged === (flagMount !== undefined)) {
      return [];
    }
    const message = flagged
      ? `slot "${slot}" has a flag, so its anchor needs a flag mount`
      : `slot "${slot}" has no flag`;
    return [{ path: `.slotAnchors[${index}].flagMount`, message }];
  });

export const plantInstrumentIssues = (registry: Registry, furniture: FurnitureDef): Issue[] => {
  const issues = flagMountIssues(furniture);
  const look = furniture.power?.instruments;
  if (!look) {
    return issues;
  }
  const issue = (path: string, message: string) => issues.push({ path: `.power.instruments.${path}`, message });
  const requires = furniture.power!.requires ?? [];
  if (requires.length === 0) {
    issue('dial', 'a condition dial needs required slots');
  }
  if (
    look.flags.length !== requires.length ||
    requires.some(({ slot }) => look.flags.filter((flag) => flag.slot === slot).length !== 1)
  ) {
    issue('flags', 'provide exactly one flag per required slot');
  }
  const bands = claimed(registry.inventory, 'player')?.conditionBands;
  const { dial } = look;
  if (
    !bands ||
    bands.some(({ word }) => dial.bands[word] === undefined) ||
    Object.keys(dial.bands).some((word) => !bands.some((band) => band.word === word))
  ) {
    issue('dial.bands', 'map every condition band, and no others');
  }
  if (
    dial.stoppedStep !== 0 ||
    dial.steps.at(-1)! - dial.steps[0]! >= 360 ||
    dial.steps.some((angle, index) => index > 0 && angle <= dial.steps[index - 1]!) ||
    Object.values(dial.bands).some((step) => step <= dial.stoppedStep || step >= dial.steps.length)
  ) {
    issue('dial.steps', 'steps must rise from a separate bottom stop, with valid producing step references');
  }
  if (bands?.some((band, index) => index > 0 && dial.bands[band.word]! < dial.bands[bands[index - 1]!.word]!)) {
    issue('dial.bands', 'condition bands must not reverse dial steps');
  }
  if (dial.steps.some((angle, index) => index > 0 && dial.swayAmplitudeDegrees * 2 >= angle - dial.steps[index - 1]!)) {
    issue('dial.swayAmplitudeDegrees', 'sway must stay strictly within a step');
  }
  if (
    dial.steps.some((_, index) => index !== dial.stoppedStep && dial.bands[dial.tickBands[String(index)]!] !== index) ||
    Object.keys(dial.tickBands).some(
      (key) =>
        !Number.isSafeInteger(Number(key)) ||
        String(Number(key)) !== key ||
        Number(key) <= dial.stoppedStep ||
        Number(key) >= dial.steps.length,
    )
  ) {
    issue('dial.tickBands', 'each producing tick needs a band mapped to its step');
  }
  if (
    Object.keys(dial.symbols ?? {}).some(
      (key) =>
        !Number.isSafeInteger(Number(key)) ||
        String(Number(key)) !== key ||
        Number(key) < 0 ||
        Number(key) >= dial.steps.length,
    )
  ) {
    issue('dial.symbols', 'symbols must reference valid dial steps');
  }
  return issues;
};
