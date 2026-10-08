import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import { insideLensAperture, type LensAperture, opticFieldOfView, opticViewSettings } from '../src/core/opticView.ts';
import type { ItemDef, ModelDef } from '../src/core/schema.ts';

const modelFor = (properties: NonNullable<ModelDef['attachment']>['properties']): ModelDef => ({
  id: 'optic_fixture_model',
  file: 'assets/models/optic_fixture_model.glb',
  attachment: {
    id: 'optic_fixture',
    kind: 'optic',
    massKg: 1,
    mount: 'rail-top',
    mountFrame: { normal: [0, -1, 0], up: [1, 0, 0] },
    properties: { ...properties, railSpanNotches: { minOffset: 0, maxOffset: 0 } },
  },
});

const itemFor = (opticMagnification?: number): ItemDef => ({
  id: 'optic_fixture_item',
  name: 'Optic fixture',
  category: 'misc',
  weight: 1,
  size: [1, 1],
  model: 'optic_fixture_model',
  ...(opticMagnification === undefined ? {} : { opticMagnification }),
});

const registryFor = (
  properties: NonNullable<ModelDef['attachment']>['properties'],
  opticMagnification?: number,
  obtainable = false,
) =>
  buildRegistry([
    {
      source: 'optic_fixture.json',
      data: {
        items: [itemFor(opticMagnification)],
        models: [modelFor(properties)],
        ...(obtainable
          ? {
              loot: [{ id: 'optic_fixture_loot', rolls: [1, 1], entries: [{ item: 'optic_fixture_item', weight: 1 }] }],
            }
          : {}),
      },
    },
  ]);

describe('optic view settings', () => {
  it('uses the core-mod value for a variable optic and preserves the exported reticle', () => {
    const item = itemFor(4);
    const model = modelFor({ magnification: { min: 1, max: 6 }, reticleKind: 'chevron' });
    expect(opticViewSettings(item, model)).toEqual({ magnification: 4, reticleKind: 'chevron' });
  });

  it('uses a fixed exported power and one-times for a reflex', () => {
    expect(
      opticViewSettings(itemFor(), modelFor({ magnification: { min: 4, max: 4 }, reticleKind: 'crosshair' })),
    ).toEqual({ magnification: 4, reticleKind: 'crosshair' });
    expect(opticViewSettings(itemFor(), modelFor({ reticleKind: 'dot' }))).toEqual({
      magnification: 1,
      reticleKind: 'dot',
    });
  });

  it('does not invent a setting for an unconfigured variable optic', () => {
    expect(opticViewSettings(itemFor(), modelFor({ magnification: { min: 2, max: 8 }, reticleKind: 'dot' }))).toBe(
      undefined,
    );
  });

  it('validates authored power against the export range', () => {
    const valid = registryFor({ magnification: { min: 1, max: 6 }, reticleKind: 'dot' }, 5);
    expect(valid.issues).toEqual([]);
    const invalid = registryFor({ magnification: { min: 1, max: 6 }, reticleKind: 'dot' }, 7);
    expect(invalid.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'items[0].opticMagnification' })]),
    );
    const missing = registryFor({ magnification: { min: 1, max: 6 }, reticleKind: 'dot' }, undefined, true);
    expect(missing.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'items[0].opticMagnification' })]),
    );
  });
});

describe('optic lens projection', () => {
  it('keeps the magnified field of view proportional to its authored power', () => {
    const fov = 75;
    const magnification = 5;
    const zoom = opticFieldOfView(fov, magnification);
    expect(Math.tan((zoom * Math.PI) / 360) * magnification).toBeCloseTo(Math.tan((fov * Math.PI) / 360));
  });

  it('clips the lens image to its projected aperture', () => {
    const aperture: LensAperture = { center: [0.5, 0.5], radius: [0.2, 0.3] };
    expect(insideLensAperture([0.5, 0.5], aperture)).toBe(true);
    expect(insideLensAperture([0.7, 0.5], aperture)).toBe(true);
    expect(insideLensAperture([0.71, 0.5], aperture)).toBe(false);
  });
});
