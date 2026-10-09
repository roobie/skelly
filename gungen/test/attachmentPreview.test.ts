import { Matrix4, Quaternion } from 'three';
import { describe, expect, it } from 'vitest';
import type { Mat3 } from '../src/core/math.ts';
import { validate } from '../src/core/validate.ts';
import { parseAttachmentFit, previewFittedAttachments } from '../src/gun/attachmentPreview.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { exportGunGlb } from '../src/gun/exportGlb.ts';
import { readGlb } from './glbReader.ts';
import { loadDesigns } from './helpers.ts';

const INCOMPATIBLE_FIT = /foregrip is incompatible/;

const ar = loadDesigns().find(({ assembly }) => assembly.name === 'archetype-ar')?.assembly;
if (!ar) {
  throw new Error('Published AR design is missing');
}

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

  it('reports unknown attachment IDs while parsing fit parameters', () => {
    expect(parseAttachmentFit(['made-up-attachment'])).toEqual({
      ok: false,
      message: 'Unknown attachment: made-up-attachment',
    });
  });

  it('keeps the firearm renderable when an attachment is incompatible with its requested port', () => {
    const result = previewFittedAttachments(validate(ar, gunDomain), ['foregrip@barrel.muzzle']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(INCOMPATIBLE_FIT);
    }
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
