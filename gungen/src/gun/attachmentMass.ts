import type { PartDef } from '@skelly/engine/assembly/schema.ts';
import { clippedExtrudedPolygonPolyhedron, polyhedronVolume } from '@skelly/engine/shapes/geometry.ts';
import type { Solid } from '@skelly/engine/shapes/solid.ts';
import { MATERIALS } from '@skelly/thing-core/materials';
import { ATTACHMENT_FAMILIES } from './attachmentParts.ts';
import { GUN_APPEARANCE, GUN_PALETTE } from './palette.ts';
import { FAMILIES } from './parts.ts';

/** Geometric volume in gungen units cubed, preserving a revolved profile's authored hollows. */
const solidVolumeCache = new Map<string, number>();
const attachmentSolidVolumeU3 = (solid: Solid): number => {
  const key = JSON.stringify(solid);
  const cached = solidVolumeCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  let result: number;
  if (solid.kind === 'box') {
    result = 8 * solid.box.half[0] * solid.box.half[1] * solid.box.half[2];
  } else if (solid.kind === 'extruded-polygon') {
    const polyhedron = clippedExtrudedPolygonPolyhedron(solid);
    result = polyhedron ? polyhedronVolume(polyhedron) : 0;
  } else {
    let volume = 0;
    for (let index = 0; index < solid.profile.length; index++) {
      const [x1, r1] = solid.profile[index]!;
      const [x2, r2] = solid.profile[(index + 1) % solid.profile.length]!;
      volume += ((x2 - x1) * (r1 * r1 + r1 * r2 + r2 * r2)) / 3;
    }
    result = Math.PI * Math.abs(volume);
  }
  solidVolumeCache.set(key, result);
  return result;
};

const canonicalAttachmentPart = (id: string): { readonly family: string; readonly part: PartDef } => {
  if (id.startsWith('optic-')) {
    const family = FAMILIES.sight;
    if (!family) {
      throw new Error('Missing sight family for attachment mass');
    }
    return { family: 'sight', part: family.build({ type: id.slice('optic-'.length) }) };
  }
  if (id === 'real-suppressor' || id === 'improvised-suppressor') {
    return { family: 'suppressor', part: ATTACHMENT_FAMILIES.suppressor!.build({ type: id }) };
  }
  const family = FAMILIES[id] ?? ATTACHMENT_FAMILIES[id];
  if (!family) {
    throw new Error(`No attachment family for ${id}`);
  }
  const params = Object.fromEntries(
    Object.entries(family.params).flatMap(([name, spec]) => (spec.default === undefined ? [] : [[name, spec.default]])),
  );
  return { family: id, part: family.build(params) };
};

const solidMaterial = (family: string, part: PartDef, solid: Solid): string => {
  if (solid.material) {
    return solid.material;
  }
  if (part.material) {
    return part.material;
  }
  const familyMaterial = GUN_PALETTE.roleMaterials?.[family];
  const slot = solid.slot ?? part.slot ?? GUN_PALETTE.roleSlots?.[family];
  const slotMaterials: Readonly<Record<string, string>> = GUN_APPEARANCE.massSlotMaterials;
  const material = (slot === undefined ? undefined : slotMaterials[slot]) ?? familyMaterial;
  if (!material) {
    throw new Error(`No mass material for role ${family}`);
  }
  return material;
};

/** Mass in kilograms from canonical standalone geometry when an attachment ID is known. */
export const attachmentMassKg = (
  family: string,
  part: PartDef,
  metresPerUnit: number,
  attachmentId?: string,
): number => {
  const canonical = attachmentId ? canonicalAttachmentPart(attachmentId) : { family, part };
  const massFamily = canonical.family;
  const massPart = canonical.part;
  const fills: Readonly<Record<string, number>> = GUN_APPEARANCE.massFill;
  const fill = fills[massFamily];
  if (fill === undefined) {
    throw new Error(`No solid-volume fill for role ${massFamily}`);
  }
  const cubicMetresPerUnit = metresPerUnit ** 3;
  const mass = massPart.solids.reduce((sum, solid) => {
    const materialId = solidMaterial(massFamily, massPart, solid);
    const density = MATERIALS[materialId];
    if (!density) {
      throw new Error(`No attachment density for palette material ${materialId}`);
    }
    return sum + attachmentSolidVolumeU3(solid) * cubicMetresPerUnit * density.densityKgPerM3 * fill;
  }, 0);
  return mass;
};
