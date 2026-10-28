import type { OpticAperture } from '@skelly/thing-core/optic-aperture';
import type { Reticle } from '@skelly/thing-core/reticle';
import { describe, expect, it } from 'vitest';
import { buildRegistry } from '../src/core/content.ts';
import {
  insideLensAperture,
  type LensAperture,
  opticFieldOfView,
  opticRendersWorld,
  opticViewSettings,
} from '../src/core/opticView.ts';
import type { ItemDef, ModelDef } from '../src/core/schema.ts';

const aperture: OpticAperture = { aspectRatio: 1, exponent: 2 };
const reticle: Reticle = {
  focalPlane: 'second',
  referenceMagnification: 1,
  primitives: [{ kind: 'dot', center: [0, 0], radius: 0.02, color: [1, 0, 0] }],
};

const modelFor = (properties: NonNullable<NonNullable<ModelDef['gun']>['attachment']>['properties']): ModelDef => ({
  id: 'optic_fixture_model',
  file: 'assets/models/optic_fixture_model.glb',
  gun: {
    attachment: {
      id: 'optic_fixture',
      kind: 'optic',
      mount: 'rail-top',
      mountFrame: { normal: [0, -1, 0], up: [1, 0, 0] },
      properties: { aperture, reticle, ...properties, railSpanNotches: { minOffset: 0, maxOffset: 0 } },
    },
  },
});

const itemFor = (opticMagnification?: number): ItemDef => ({
  id: 'optic_fixture_item',
  economy: { usage: [], tiers: [] },
  workInProgress: false,
  notLoot: false,
  name: 'Optic fixture',
  category: 'misc',
  weight: 1,
  size: [1, 1],
  model: 'optic_fixture_model',
  opticUnityImage: 'world',
  ...(opticMagnification === undefined
    ? {}
    : { opticMagnification, opticZoom: { step: 0.5, rememberPerWeapon: true } }),
});

const registryFor = (
  properties: NonNullable<NonNullable<ModelDef['gun']>['attachment']>['properties'],
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
    const model = modelFor({ magnification: { min: 1, max: 6 }, reticle });
    expect(opticViewSettings(item, model)).toEqual({ magnification: 4, worldAtUnity: true, aperture, reticle });
  });

  it('uses a fixed exported power and one-times for a reflex', () => {
    expect(opticViewSettings(itemFor(), modelFor({ magnification: { min: 4, max: 4 }, reticle }))).toEqual({
      magnification: 4,
      worldAtUnity: true,
      aperture,
      reticle,
    });
    expect(opticViewSettings(itemFor(), modelFor({ reticle }))).toEqual({
      magnification: 1,
      worldAtUnity: true,
      aperture,
      reticle,
    });
  });

  it.each(['world', 'source'] as const)(
    'uses the authored %s unity image without changing magnified images',
    (policy) => {
      const item = { ...itemFor(), opticUnityImage: policy };
      const settings = opticViewSettings(item, modelFor({ reticle }))!;
      expect(settings.worldAtUnity).toBe(policy === 'world');
      expect(opticRendersWorld(settings)).toBe(policy === 'world');
      expect(opticRendersWorld({ ...settings, magnification: 4 })).toBe(true);
    },
  );

  it('rejects an optic window without an authored unity image policy', () => {
    const item = { ...itemFor(), opticUnityImage: undefined };
    const model = modelFor({ reticle });
    expect(opticViewSettings(item, model)).toBeUndefined();
    const registry = buildRegistry([{ source: 'fixture.json', data: { items: [item], models: [model] } }]);
    expect(registry.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'items[0].opticUnityImage' })]),
    );
  });

  it('does not invent a setting for an unconfigured variable optic', () => {
    expect(opticViewSettings(itemFor(), modelFor({ magnification: { min: 2, max: 8 }, reticle }))).toBe(undefined);
  });

  it('requires zoom tuning for supported variable optics and rejects it on fixed models', () => {
    const properties = { magnification: { min: 1, max: 6 } };
    const item = { ...itemFor(4), opticZoom: undefined };
    expect(opticViewSettings(item, modelFor(properties))).toBeUndefined();
    const missing = buildRegistry([
      { source: 'fixture.json', data: { items: [item], models: [modelFor(properties)] } },
    ]);
    expect(missing.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'items[0].opticZoom' })]));
    const fixed = registryFor({ magnification: { min: 4, max: 4 } }, 4);
    expect(fixed.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'items[0].opticZoom' })]));
  });

  it('uses the exported aperture profile rather than optic identity', () => {
    const rounded: OpticAperture = { aspectRatio: 1.4, exponent: 6 };
    const lens: LensAperture = { center: [0.5, 0.5], radius: [0.2, 0.2] };
    const corner = [lens.center[0] + lens.radius[0] * 0.8, lens.center[1] + lens.radius[1] * 0.8] as const;
    for (const [shape, includesCorner] of [
      [aperture, false],
      [rounded, true],
    ] as const) {
      const settings = opticViewSettings(itemFor(), modelFor({ aperture: shape }));
      expect(settings?.aperture).toEqual(shape);
      expect(insideLensAperture(corner, lens, settings!.aperture)).toBe(includesCorner);
    }
    expect(opticViewSettings(itemFor(), modelFor({ aperture: undefined }))).toBeUndefined();
    expect(registryFor({ aperture: undefined }).issues.length).toBeGreaterThan(0);
  });

  it('rejects an optic export with no authored reticle', () => {
    expect(registryFor({ reticle: undefined }).issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'models[0].gun.attachment' })]),
    );
  });

  it('validates authored power against the export range', () => {
    const valid = registryFor({ magnification: { min: 1, max: 6 }, reticle }, 5);
    expect(valid.issues).toEqual([]);
    const invalid = registryFor({ magnification: { min: 1, max: 6 }, reticle }, 7);
    expect(invalid.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'items[0].opticMagnification' })]),
    );
    const missing = registryFor({ magnification: { min: 1, max: 6 }, reticle }, undefined, true);
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
    const lens: LensAperture = { center: [0.5, 0.5], radius: [0.2, 0.3] };
    expect(insideLensAperture([0.5, 0.5], lens, aperture)).toBe(true);
    expect(insideLensAperture([0.7, 0.5], lens, aperture)).toBe(true);
    expect(insideLensAperture([0.71, 0.5], lens, aperture)).toBe(false);
  });
});
