import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppearanceContext } from '@skelly/engine/core/design.ts';
import type { Mat3 } from '@skelly/engine/core/math.ts';
import { resolve } from '@skelly/engine/core/resolve.ts';
import { validate } from '@skelly/engine/core/validate.ts';
import { Matrix4, Mesh, MeshStandardMaterial, Quaternion } from 'three';
import { describe, expect, it } from 'vitest';
import { exportAttachmentGlb } from '../src/gun/attachmentExport.ts';
import { parseAttachmentFit, previewFittedAttachments } from '../src/gun/attachmentPreview.ts';
import { attachmentMetadata, attachmentMountSlot, withAttachmentInstanceAppearances } from '../src/gun/attachments.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { exportGunGlb } from '../src/gun/exportGlb.ts';
import { buildLayers } from '../src/viewer/scene.ts';
import { readGlb } from './glbReader.ts';
import { loadDesigns } from './helpers.ts';

const ar = loadDesigns().find(({ assembly }) => assembly.name === 'archetype-ar')?.assembly;
if (!ar) {
  throw new Error('Published AR design is missing');
}

const awm = loadDesigns().find(({ assembly }) => assembly.name === 'archetype-awm')?.assembly;
if (!awm) {
  throw new Error('Published AWM design is missing');
}

const suppressorColor = (assembly: typeof ar, context: AppearanceContext): string => {
  const preview = previewFittedAttachments(validate(assembly, gunDomain), ['real-suppressor@barrel.muzzle']);
  if (!preview.ok) {
    throw new Error(preview.message);
  }
  const layers = buildLayers(preview.report, [], 'finish', context);
  const mesh = layers.solids.children.find(
    (child): child is Mesh => child instanceof Mesh && child.userData.part === 'fit-preview-0',
  );
  if (!(mesh && mesh.material instanceof MeshStandardMaterial)) {
    throw new Error('Preview suppressor has no rendered material');
  }
  return `#${mesh.material.color.getHexString()}`;
};

const designHasAttachment = (assembly: Parameters<typeof exportGunGlb>[0]): boolean => {
  const resolved = resolve(assembly, gunDomain);
  return [...resolved.defs.entries()].some(([id, definition]) => {
    const instance = resolved.assembly.parts[id];
    if (!instance) {
      return false;
    }
    const params = resolved.params.get(id);
    const metadata = attachmentMetadata(
      instance.family,
      params && Object.fromEntries(Object.entries(params).map(([name, value]) => [name, value.value])),
      resolved.domain.units.metresPerUnit,
      definition,
    );
    return Boolean(metadata && attachmentMountSlot(resolved, id, metadata.mount));
  });
};

const rotationMatrix = (rotation: Mat3): Matrix4 =>
  new Matrix4().set(
    rotation[0],
    rotation[1],
    rotation[2],
    0,
    rotation[3],
    rotation[4],
    rotation[5],
    0,
    rotation[6],
    rotation[7],
    rotation[8],
    0,
    0,
    0,
    0,
    1,
  );

const exportDesign = (assembly: Parameters<typeof exportGunGlb>[0]) => {
  const design = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', 'designs', `${assembly.name}.json`), 'utf8'),
  ) as { template: string; finish?: Readonly<Record<string, string>> };
  const exported = exportGunGlb(
    assembly,
    { id: assembly.name, file: `assets/models/${assembly.name}.glb` },
    { variant: design.template, ...(design.finish ? { finish: design.finish } : {}) },
  );
  if (!exported.ok) {
    throw new Error(`${assembly.name}: ${JSON.stringify(exported.error)}`);
  }
  return exported;
};

const viewerAttachmentMaterials = (layers: ReturnType<typeof buildLayers>, partId: string): string[] =>
  layers.solids.children.flatMap((child) => {
    if (!(child instanceof Mesh && child.userData.part === partId && child.material instanceof MeshStandardMaterial)) {
      return [];
    }
    return [`#${child.material.color.getHexString()}`];
  });

const attachmentMaterialPair = (
  gunJson: ReturnType<typeof readGlb>['json'],
  designName: string,
  attachment: { id: string; node: string },
): { label: string; host: string[]; item: string[] } => {
  const node = gunJson.nodes.find(({ name }) => name === attachment.node);
  if (node?.mesh === undefined) {
    throw new Error(`${designName}: attachment node ${attachment.node} has no mesh`);
  }
  const hostMaterials = gunJson.meshes[node.mesh]!.primitives.map(
    ({ material }) => gunJson.materials[material]!.name!,
  ).sort();
  const id = attachment.id.replaceAll('-', '_');
  const standalone = exportAttachmentGlb(attachment.id, {
    id,
    file: `assets/models/${id}.glb`,
  });
  if (!standalone.ok) {
    throw new Error(`${attachment.id}: ${JSON.stringify(standalone.error)}`);
  }
  const itemGlb = readGlb(standalone.glb).json;
  const itemMaterials = itemGlb.meshes
    .flatMap(({ primitives }) => primitives.map(({ material }) => itemGlb.materials[material]!.name!))
    .sort();
  return { label: `${designName} ${attachment.id}`, host: hostMaterials, item: itemMaterials };
};

describe('viewer attachment previews', () => {
  it('parses repeated attachment IDs with optional explicit mount ports', () => {
    expect(parseAttachmentFit(['real-suppressor', 'optic-mini-reflex@receiver.rail.3'])).toEqual({
      ok: true,
      requests: [{ id: 'real-suppressor' }, { id: 'optic-mini-reflex', port: 'receiver.rail.3' }],
    });
  });

  it('rejects unknown attachment IDs and identifies the rejected ID', () => {
    const result = parseAttachmentFit(['made-up-attachment']);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Unknown attachment was accepted');
    }
    expect(result.message).toContain('made-up-attachment');
  });

  it("refuses an attachment its requested port can't take", () => {
    const result = previewFittedAttachments(validate(ar, gunDomain), ['foregrip@barrel.muzzle']);
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Incompatible attachment was accepted');
    }
    expect(result.message).toContain('foregrip');
  });

  it('keeps suppressor appearance independent of the host gun finish', () => {
    const arColor = suppressorColor(ar, { variant: 'ar' });
    const awmColor = suppressorColor(awm, { variant: 'awm' });
    expect(arColor).toBe(awmColor);
  });

  it('resolves different appearance data for separate suppressor instances', () => {
    const asset = { id: 'real_suppressor', file: 'assets/models/real_suppressor.glb' } as const;
    const black = exportAttachmentGlb('real-suppressor', asset, {
      finish: { metal: 'alu-anodized-black' },
    });
    const green = exportAttachmentGlb('real-suppressor', asset, {
      finish: { metal: 'polymer-od-green' },
    });
    if (!(black.ok && green.ok)) {
      throw new Error('Suppressor instance export failed');
    }
    const blackColor = readGlb(black.glb).json.materials[0]?.name;
    const greenColor = readGlb(green.glb).json.materials[0]?.name;
    expect(greenColor).not.toBe(blackColor);
  });

  const designsWithAttachments = loadDesigns().filter(({ assembly }) => designHasAttachment(assembly));
  it('finds published design-authored attachments to verify', () => {
    expect(designsWithAttachments.length).toBeGreaterThan(0);
  });

  for (const { assembly } of designsWithAttachments) {
    it(`exports ${assembly.name} attachment materials like their standalone item models`, () => {
      const exported = exportDesign(assembly);
      const { json } = readGlb(exported.glb);
      const design = JSON.parse(
        readFileSync(join(import.meta.dirname, '..', 'designs', `${assembly.name}.json`), 'utf8'),
      ) as { template: string; finish?: Readonly<Record<string, string>> };
      const report = validate(assembly, gunDomain);
      const normalizedReport = { ...report, resolved: withAttachmentInstanceAppearances(report.resolved) };
      const layers = buildLayers(normalizedReport, [], 'finish', {
        variant: design.template,
        ...(design.finish ? { finish: design.finish } : {}),
      });
      const attachments = exported.modelEntry.attachments ?? [];
      expect(attachments.length).toBeGreaterThan(0);
      for (const attachment of attachments) {
        const pair = attachmentMaterialPair(json, assembly.name, attachment);
        expect(pair.host, pair.label).toEqual(pair.item);
        const partId = attachment.node.split(':')[0]!;
        const viewerMaterials = [...new Set(viewerAttachmentMaterials(layers, partId))].sort();
        expect(viewerMaterials, `${pair.label} viewer`).toEqual([...new Set(pair.item)].sort());
      }
    });
  }

  it('matches fitted preview appearance to the standalone attachment export', () => {
    const exported = exportAttachmentGlb('real-suppressor', {
      id: 'real_suppressor',
      file: 'assets/models/real_suppressor.glb',
    });
    if (!exported.ok) {
      throw new Error(JSON.stringify(exported.error));
    }
    expect(suppressorColor(ar, { variant: 'ar' })).toBe(readGlb(exported.glb).json.materials[0]?.name);
  });

  it('exports a preview attachment at the same transform as the fitted GLB node', () => {
    const preview = previewFittedAttachments(validate(ar, gunDomain), ['real-suppressor@barrel.muzzle']);
    if (!preview.ok) {
      throw new Error(preview.message);
    }
    const partId = 'fit-preview-0';
    const transform = preview.report.resolved.placed.get(partId);
    if (!transform) {
      throw new Error('Preview suppressor was not placed');
    }
    const exported = exportGunGlb(
      preview.report.resolved.assembly,
      { id: 'fit_preview_ar', file: 'assets/models/fit_preview_ar.glb' },
      {},
    );
    if (!exported.ok) {
      throw new Error(JSON.stringify(exported.error));
    }
    const nodeName = exported.modelEntry.attachments?.find(({ id }) => id === 'real-suppressor')?.node;
    const node = readGlb(exported.glb).json.nodes.find(({ name }) => name === nodeName);
    if (!node) {
      throw new Error(`Export omitted the fitted suppressor node: ${JSON.stringify(exported.modelEntry.attachments)}`);
    }

    const units = preview.report.resolved.domain.units.metresPerUnit;
    expect(node.translation ?? [0, 0, 0]).toEqual(transform.t.map((value) => value * units));
    const expectedRotation = new Quaternion().setFromRotationMatrix(rotationMatrix(transform.r));
    const exportedRotation = new Quaternion(...((node.rotation ?? [0, 0, 0, 1]) as [number, number, number, number]));
    expect(Math.abs(expectedRotation.dot(exportedRotation))).toBeCloseTo(1, 6);
  });
});
