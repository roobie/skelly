import { Matrix4, Mesh, MeshStandardMaterial, Quaternion } from 'three';
import { describe, expect, it } from 'vitest';
import type { AppearanceContext } from '../src/core/design.ts';
import type { Mat3 } from '../src/core/math.ts';
import { validate } from '../src/core/validate.ts';
import { exportAttachmentGlb } from '../src/gun/attachmentExport.ts';
import { parseAttachmentFit, previewFittedAttachments } from '../src/gun/attachmentPreview.ts';
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
