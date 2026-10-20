import type { PartDef, Resolved } from '@skelly/engine/assembly/schema.ts';
import { MATERIALS } from '@skelly/thing-core/materials';
import { modelParts, type PhysicalInputs } from '@skelly/thing-export/physical.ts';
import { ATTACHMENT_FAMILIES } from './attachmentParts.ts';
import { attachmentMetadata } from './attachments.ts';
import { FAMILIES } from './parts.ts';
import content from './physical.json' with { type: 'json' };

interface RolePhysics {
  readonly material: string;
  readonly fill: { readonly fraction: number; readonly source: string };
  readonly slotMaterials?: Readonly<Record<string, string>>;
}

const physicalInputs = (part: PartDef): PhysicalInputs => {
  const roles: Readonly<Record<string, RolePhysics>> = content.roles;
  const role = roles[part.family];
  if (!role) {
    throw new Error(`No physical inputs for ${part.family}`);
  }
  const slots: Readonly<Record<string, string>> = content.slotMaterials;
  return {
    part,
    fillFraction: role.fill.fraction,
    materialFor: (solid) => {
      const slot = solid.slot ?? part.slot;
      const materialId =
        solid.material ??
        part.material ??
        (slot === undefined ? undefined : (role.slotMaterials?.[slot] ?? slots[slot])) ??
        role.material;
      const material = MATERIALS[materialId];
      if (!material) {
        throw new Error(`No physical material ${materialId}`);
      }
      return material;
    },
  };
};

const canonicalAttachmentPart = (id: string): PartDef => {
  if (id.startsWith('optic-')) {
    return FAMILIES.sight!.build({ type: id.slice('optic-'.length) });
  }
  if (id === 'real-suppressor' || id === 'improvised-suppressor') {
    return ATTACHMENT_FAMILIES.suppressor!.build({ type: id });
  }
  const family = FAMILIES[id] ?? ATTACHMENT_FAMILIES[id];
  if (!family) {
    throw new Error(`No physical attachment family for ${id}`);
  }
  const params = Object.fromEntries(
    Object.entries(family.params).flatMap(([name, spec]) => (spec.default === undefined ? [] : [[name, spec.default]])),
  );
  return family.build(params);
};

export const gunModelParts = (resolved: Resolved) =>
  modelParts(resolved, (id, part) => {
    const instance = resolved.assembly.parts[id];
    if (!instance) {
      throw new Error(`No physical instance for ${id}`);
    }
    const source = { ...part, family: instance.family };
    const params = resolved.params.get(id);
    const metadata = attachmentMetadata(
      instance.family,
      params && Object.fromEntries(Object.entries(params).map(([name, parameter]) => [name, parameter.value])),
      resolved.domain.units.metresPerUnit,
      source,
    );
    // A host-specific mount envelope must not change the physical identity of a fitted item.
    return physicalInputs(metadata ? canonicalAttachmentPart(metadata.id) : source);
  });
