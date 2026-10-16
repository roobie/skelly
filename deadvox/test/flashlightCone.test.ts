import { compileFunction } from 'node:vm';
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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRegistry, validateContent } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import { toggleLight } from '../src/core/lights.ts';
import { type BeamSpill, BeamSpillSchema } from '../src/core/schema.ts';
import { HeldItems } from '../src/render/hands.ts';

let Flashlight: typeof import('../src/render/flashlight.ts').Flashlight;
let cone: typeof import('../src/render/flashlightCone.ts');
const originalChunk = ShaderChunk.lights_pars_begin;
const originalUniforms = Object.values(ShaderLib).map((shader) => [shader, { ...shader.uniforms }] as const);
const restoreShaders = () => {
  ShaderChunk.lights_pars_begin = originalChunk;
  for (const [shader, uniforms] of originalUniforms) {
    shader.uniforms = { ...uniforms };
  }
};
beforeEach(async () => {
  restoreShaders();
  vi.resetModules();
  ({ Flashlight } = await import('../src/render/flashlight.ts'));
  cone = await import('../src/render/flashlightCone.ts');
});
afterEach(restoreShaders);

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

// Execute the production scalar GLSL body as JavaScript, retaining its branches and expressions.
const attenuation = (chunk: string) =>
  compileFunction(chunk.replace('uniform vec2 uFlashlightSpill;\n', '').replace(/\bfloat\b/g, 'const'), [
    'coneCosine',
    'penumbraCosine',
    'angleCosine',
    'uFlashlightSpill',
    'smoothstep',
    'sqrt',
    'mix',
  ]);
const smoothstep = (edge0: number, edge1: number, value: number): number => {
  if (edge0 === edge1) {
    return Number.NaN;
  }
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
const plainSource = 'return smoothstep( coneCosine, penumbraCosine, angleCosine );';

describe('flashlight cone', () => {
  it('accepts a plain beam and validates optional spill and decay', () => {
    expect(validateContent(source({ ...beam, spill: profile }))).toEqual([]);
    expect(validateContent(source(beam))).toEqual([]);
    expect(validateContent(source({ ...beam, spill: { ...profile, radiusRatio: 0 } }))).not.toEqual([]);
    expect(validateContent(source({ ...beam, decay: -1 }))).not.toEqual([]);
  });

  it.each([true, false])('updates content spill without changing programs with comparison enabled=%s', (enabled) => {
    const expectProfile = (uniforms: typeof ShaderLib.lambert.uniforms, spill: BeamSpill | undefined) => {
      const value = uniforms.uFlashlightSpill!.value as Float32Array;
      expect(value[0]).toBeCloseTo(spill ? spill.radiusRatio ** 2 : 1);
      expect(value[1]).toBeCloseTo(spill?.intensity ?? 0);
    };
    const scene = new Scene();
    const torch = new Flashlight(scene, enabled);
    const camera = new PerspectiveCamera();
    const chunk = ShaderChunk.lights_pars_begin;
    expect(chunk.includes('uniform vec2 uFlashlightSpill;')).toBe(enabled);
    const warmUniforms = UniformsUtils.clone(ShaderLib.lambert.uniforms);
    const material = new MeshLambertMaterial();
    scene.add(new Mesh(undefined, material));
    const key = material.customProgramCacheKey();
    const { version } = material;
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
        effectiveSpill ? cone.spillHalfAngle(torch.light.angle, effectiveSpill) / torch.light.angle : 1,
      );
      expect(ShaderChunk.lights_pars_begin).toBe(chunk);
      expect(material.customProgramCacheKey()).toBe(key);
      expect(material.version).toBe(version);
      const lateMaterial = new MeshLambertMaterial();
      expect(lateMaterial.customProgramCacheKey()).toBe(key);
      lateMaterial.dispose();
      const lateUniforms = UniformsUtils.clone(ShaderLib.lambert.uniforms);
      if (enabled) {
        expectProfile(warmUniforms, effectiveSpill);
        expectProfile(lateUniforms, effectiveSpill);
      } else {
        expect(lateUniforms).not.toHaveProperty('uFlashlightSpill');
      }
      held.dispose();
    }
    material.dispose();
  });

  it('plain uniforms reproduce the unmodified cone across its hotspot, edge and exterior', () => {
    cone.installFlashlightSpill();
    cone.setFlashlightSpill(undefined);
    const [x, y] = ShaderLib.lambert.uniforms.uFlashlightSpill!.value as Float32Array;
    const patched = attenuation(cone.withFlashlightSpill(plainSource));
    const original = attenuation(plainSource);
    const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;
    for (const [halfAngle, penumbra] of [
      [0.1, 1],
      [0.4, 0.5],
      [1.2, 0.1],
    ]) {
      const edge = Math.cos(halfAngle!);
      const inner = Math.cos(halfAngle! * (1 - penumbra!));
      for (const angle of [-1, edge - 0.01, edge, (edge + inner) / 2, inner, 1]) {
        const args = [edge, inner, angle, { x, y }, smoothstep, Math.sqrt, mix];
        const expected = original(...args) as number;
        expect(patched(...args)).toBe(expected);
        expect(Number.isFinite(expected)).toBe(true);
      }
    }
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
      const outer = cone.spillHalfAngle(halfAngle, profile);
      expect(Math.tan(outer) / Math.tan(halfAngle)).toBeCloseTo(profile.radiusRatio);
    }
  });

  it('installs the content profile before warm-up and only once without adding a second light', () => {
    const scene = new Scene();
    const first = new Flashlight(scene);
    const once = ShaderChunk.lights_pars_begin;
    cone.installFlashlightSpill();
    expect(ShaderChunk.lights_pars_begin).toBe(once);
    expect(once).toContain('return mix( spill, 1.0, hotspot );');
    expect(scene.children.filter((child) => child.type === 'SpotLight')).toEqual([first.light]);
    expect(() => cone.withFlashlightSpill('changed upstream shader')).toThrow('spot attenuation not found');
  });
});
