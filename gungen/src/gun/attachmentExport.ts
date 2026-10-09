import type { AppearanceContext, GlbAssetIdentity, GlbExportError } from '../core/design.ts';
import { exportGlb } from '../core/glb.ts';
import { resolve } from '../core/resolve.ts';
import type { Assembly, PartFamily } from '../core/schema.ts';
import { ATTACHMENT_FAMILIES } from './attachmentParts.ts';
import { attachmentInstanceForId, attachmentMetadata } from './attachments.ts';
import { gunDomain } from './domain.ts';
import type { DeadvoxModelEntry, DeadvoxModelFile } from './exportGlb.ts';
import { GUN_PALETTE } from './palette.ts';
import { FAMILIES } from './parts.ts';

export type AttachmentExportResult =
  | { readonly ok: true; readonly glb: Uint8Array; readonly modelEntry: DeadvoxModelEntry }
  | { readonly ok: false; readonly error: GlbExportError };

/** Exports one attachment part at its mount base as a standalone loot/item model. */
export const exportAttachmentGlb = (
  id: string,
  asset: GlbAssetIdentity,
  appearance: AppearanceContext = {},
): AttachmentExportResult => {
  const instance = attachmentInstanceForId(id);
  const family = FAMILIES[instance.family] ?? ATTACHMENT_FAMILIES[instance.family];
  if (!family) {
    throw new Error(`Attachment ${id} has no part family`);
  }
  const assembly: Assembly = {
    name: asset.id,
    root: id,
    parts: { [id]: { family: instance.family, ...(instance.params ? { params: instance.params } : {}) } },
    connections: [],
  };
  // Preserve authored mount frames, but an item model is not an incomplete gun assembly.
  const standaloneFamily: PartFamily = {
    ...family,
    build: (partParams) => {
      const part = family.build(partParams);
      return { ...part, ports: part.ports.map((port) => ({ ...port, required: false })) };
    },
  };
  const domain = {
    ...gunDomain,
    families: { ...gunDomain.families, [instance.family]: standaloneFamily },
    axisRules: [],
    rules: [],
  };
  const resolved = resolve(assembly, domain);
  const result = exportGlb({ resolved, palette: GUN_PALETTE, appearance, asset });
  if (!result.ok) {
    return result;
  }
  const { params } = instance;
  const metadata = attachmentMetadata(instance.family, params, domain.units.metresPerUnit, resolved.defs.get(id));
  if (!metadata) {
    throw new Error(`Attachment ${id} has no game metadata`);
  }
  return {
    ok: true,
    glb: result.glb,
    modelEntry: {
      id: asset.id,
      file: asset.file as DeadvoxModelFile,
      attachment: metadata,
    },
  };
};
