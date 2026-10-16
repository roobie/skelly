import {
  MathUtils,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  ShaderChunk,
  ShaderLib,
  UniformsUtils,
} from 'three';
import { safeParse } from 'valibot';
import { describe, expect, it } from 'vitest';
import { buildRegistry, validateContent } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { toggleLight } from '../src/core/lights.ts';
import { BeamSpillSchema } from '../src/core/schema.ts';
import { Flashlight } from '../src/render/flashlight.ts';
import {
  installFlashlightSpill,
  setFlashlightSpill,
  spillHalfAngle,
  withFlashlightSpill,
} from '../src/render/flashlightCone.ts';
import { HeldItems } from '../src/render/hands.ts';

const profile = { radiusRatio: 1.8, intensity: 0.2 };
const beam = { angleDegrees: 50, penumbra: 0.5, decay: 1.3 };
const source = (shape: object) => ({
  source: 'fixture-beam.json',
  data: {
    items: [
      {
        id: 'fixture_beam',
        name: 'Fixture beam',
        category: 'light',
        economy: { usage: [], tiers: [] },
        weight: 10,
        size: [1, 1],
        wearable: { slot: 'head', encumbrance: 0 },
        light: { radius: 10, seenFrom: 10, color: '#ffffff', intensity: 2, beam: shape },
      },
    ],
  },
});

describe('flashlight cone', () => {
  it('accepts a plain beam and validates optional spill and decay', () => {
    expect(validateContent(source({ ...beam, spill: profile }))).toEqual([]);
    expect(validateContent(source(beam))).toEqual([]);
    expect(validateContent(source({ ...beam, spill: { ...profile, radiusRatio: 0 } }))).not.toEqual([]);
    expect(validateContent(source({ ...beam, decay: -1 }))).not.toEqual([]);
  });

  it.each([true, false])('resolves content spill and plain-cone variants with comparison enabled=%s', (enabled) => {
    const scene = new Scene();
    const torch = new Flashlight(scene, enabled);
    const camera = new PerspectiveCamera();
    const material = new MeshLambertMaterial();
    scene.add(new Mesh(undefined, material));
    const variantKeys: string[] = [];
    for (const spill of [profile, undefined, { ...profile, radiusRatio: 2 }]) {
      const effectiveSpill = enabled ? spill : undefined;
      const { registry } = buildRegistry([source({ ...beam, spill })]);
      const inventory = new Inventory(registry);
      const lit = inventory.create('fixture_beam');
      expect(inventory.add(lit, { kind: 'worn' })).toBe(true);
      expect(toggleLight(registry, lit)).toBeUndefined();
      const held = new HeldItems(inventory, undefined, { skin: '#ffffff', shirt: '#ffffff', trousers: '#ffffff' });
      torch.update({ registry, inventory, lit, held, camera });
      expect(torch.light.intensity).toBe(2 * torch.strength);
      expect(torch.light.distance).toBe(10);
      expect(torch.light.decay).toBe(beam.decay);
      expect(torch.light.penumbra).toBe(beam.penumbra);
      expect(torch.light.angle).toBeCloseTo(MathUtils.degToRad(beam.angleDegrees / 2));
      expect(torch.light.shadow.focus).toBeCloseTo(
        effectiveSpill ? spillHalfAngle(torch.light.angle, effectiveSpill) / torch.light.angle : 1,
      );
      variantKeys.push(material.customProgramCacheKey());
      for (const shader of Object.values(ShaderLib)) {
        expect('uFlashlightSpill' in shader.uniforms).toBe(effectiveSpill !== undefined);
      }
      expect(ShaderChunk.lights_pars_begin.includes('uniform vec2 uFlashlightSpill;')).toBe(
        effectiveSpill !== undefined,
      );
      held.dispose();
    }
    expect(variantKeys[0] === variantKeys[1]).toBe(!enabled);
    expect(variantKeys[0]).toBe(variantKeys[2]);
    material.dispose();
  });

  it('rejects malformed profiles at the shared content boundary', () => {
    expect(safeParse(BeamSpillSchema, profile).success).toBe(true);
    for (const invalid of [
      { ...profile, radiusRatio: 1 },
      { ...profile, intensity: 1 },
      { ...profile, intensity: -0.1 },
      { ...profile, radiusRatio: Number.POSITIVE_INFINITY },
    ]) {
      expect(safeParse(BeamSpillSchema, invalid).success).toBe(false);
    }
  });

  it('widens the shadow cone radius by the content profile ratio', () => {
    for (const halfAngle of [8, 30, 65].map(MathUtils.degToRad)) {
      const outer = spillHalfAngle(halfAngle, profile);
      expect(Math.tan(outer) / Math.tan(halfAngle)).toBeCloseTo(profile.radiusRatio);
    }
  });

  it('shares active-light values with cloned built-in uniforms without changing shader source', () => {
    installFlashlightSpill();
    const programs = Object.values(ShaderLib).map(({ uniforms }) => UniformsUtils.clone(uniforms));
    const chunk = ShaderChunk.lights_pars_begin;
    for (const next of [profile, { radiusRatio: 2.3, intensity: 0.08 }]) {
      setFlashlightSpill(next);
      for (const uniforms of programs) {
        const value = uniforms.uFlashlightSpill!.value as Float32Array;
        expect(value[0]).toBeCloseTo(next.radiusRatio ** 2);
        expect(value[1]).toBeCloseTo(next.intensity);
      }
      expect(ShaderChunk.lights_pars_begin).toBe(chunk);
    }
  });

  it('installs the content profile once without adding a second light', () => {
    const scene = new Scene();
    const first = new Flashlight(scene);
    installFlashlightSpill();
    const once = ShaderChunk.lights_pars_begin;
    installFlashlightSpill();
    expect(ShaderChunk.lights_pars_begin).toBe(once);
    expect(once).toContain('return mix( spill, 1.0, hotspot );');
    expect(scene.children.filter((child) => child.type === 'SpotLight')).toEqual([first.light]);
    expect(() => withFlashlightSpill('changed upstream shader')).toThrow('spot attenuation not found');
  });
});
