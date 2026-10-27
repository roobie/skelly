import { readdirSync, readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import {
  Light,
  MathUtils,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  ShaderChunk,
  ShaderLib,
  UniformsUtils,
  type Vector3,
} from 'three';
import type { WebGLExtensions } from 'three/src/renderers/webgl/WebGLExtensions.js';
import { WebGLLights } from 'three/src/renderers/webgl/WebGLLights.js';
import { safeParse } from 'valibot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRegistry, validateContent } from '../src/core/content.ts';
import { Inventory } from '../src/core/inventory.ts';
import type { Item } from '../src/core/items.ts';
import { toggleLight } from '../src/core/lights.ts';
import { type BeamSpill, BeamSpillSchema, type ContentFile } from '../src/core/schema.ts';
import { CALIBRATED_NEAR_FIELD_M } from './flashlightFixture.ts';

let Flashlight: typeof import('../src/render/flashlight.ts').Flashlight;
let cone: typeof import('../src/render/flashlightCone.ts');
const originalChunk = ShaderChunk.lights_pars_begin;
const originalFragment = ShaderChunk.lights_fragment_begin;
const originalUniforms = Object.values(ShaderLib).map((shader) => [shader, { ...shader.uniforms }] as const);
const restoreShaders = () => {
  ShaderChunk.lights_pars_begin = originalChunk;
  ShaderChunk.lights_fragment_begin = originalFragment;
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

const beamAnchors = () => ({
  lensOf: (_item: Item, _out: Vector3) => false,
  shoulderPosition: (_side: string, out: Vector3) => {
    out.set(0, 0, 0);
  },
  eyePosition: (out: Vector3) => {
    out.set(0, 0, 0);
  },
  aimDirection: (out: Vector3) => {
    out.set(0, 0, -1);
  },
  dispose: () => undefined,
});
const profile = { enabled: true, radiusRatio: 1.8, intensity: 0.2 };
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
        workInProgress: false,
        notLoot: false,
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
  compileFunction(chunk.replace(/\bfloat\b/g, 'const'), [
    'coneCosine',
    'penumbraCosine',
    'angleCosine',
    'spillProfile',
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

  it.each([undefined, true, false])(
    'applies spill by content and the comparison switch %s without changing programs',
    (override) => {
      const enabled = override !== false;
      // Content decides without a switch; `true` turns on spill that is present, `false` forces the plain cone.
      const spillShown = (spill: BeamSpill | undefined): BeamSpill | undefined => {
        if (override === false || !spill) {
          return undefined;
        }
        return (override ?? spill.enabled) ? spill : undefined;
      };
      const expectProfile = (uniforms: typeof ShaderLib.lambert.uniforms, spill: BeamSpill | undefined) => {
        const value = uniforms.uFlashlightSpill!.value as Float32Array;
        expect(value[0]).toBeCloseTo(spill ? spill.radiusRatio ** 2 : 1);
        expect(value[1]).toBeCloseTo(spill?.intensity ?? 0);
      };
      const scene = new Scene();
      const torch = new Flashlight(scene, 1, CALIBRATED_NEAR_FIELD_M, override);
      const camera = new PerspectiveCamera();
      const chunk = ShaderChunk.lights_pars_begin;
      expect(chunk.includes('uniform vec2 uFlashlightSpill[ NUM_SPOT_LIGHTS ];')).toBe(enabled);
      const warmUniforms = UniformsUtils.clone(ShaderLib.lambert.uniforms);
      const material = new MeshLambertMaterial();
      scene.add(new Mesh(undefined, material));
      const key = material.customProgramCacheKey();
      const { version } = material;
      for (const spill of [profile, { ...profile, enabled: false }, undefined, { ...profile, radiusRatio: 2 }]) {
        const effectiveSpill = spillShown(spill);
        const { registry } = buildRegistry([source({ ...beam, spill })]);
        const inventory = new Inventory(registry);
        const lit = inventory.create('fixture_beam');
        expect(inventory.add(lit, { kind: 'worn' })).toBe(true);
        expect(toggleLight(registry, lit)).toBeUndefined();
        const held = beamAnchors();
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
    },
  );

  it('switching a casting beam on or off leaves the lights state that keys shader programs unchanged', () => {
    const { registry, issues } = buildRegistry([source(beam)]);
    expect(issues).toEqual([]);
    const inventory = new Inventory(registry);
    const lamp = inventory.create('fixture_beam');
    expect(inventory.add(lamp, { kind: 'worn' })).toBe(true);
    const held = beamAnchors();
    const scene = new Scene();
    const torch = new Flashlight(scene, 2, CALIBRATED_NEAR_FIELD_M);
    torch.shadowsAllowed = true;
    // three.js's own light state: WebGLRenderer rebuilds a lit material's program whenever its version moves.
    const lights = new WebGLLights({ has: () => false } as unknown as WebGLExtensions);
    const sceneLights = scene.children.filter((child): child is Light => child instanceof Light);
    const frame = (lit: Item | undefined): number => {
      torch.update({ registry, inventory, lit, held, camera: new PerspectiveCamera() });
      lights.setup(sceneLights);
      return lights.state.version;
    };
    const off = frame(undefined);
    expect(toggleLight(registry, lamp)).toBeUndefined();
    expect(torch.light.intensity).toBe(0);
    const on = frame(lamp);
    expect(torch.light.intensity).toBeGreaterThan(0);
    expect(toggleLight(registry, lamp)).toBeUndefined();
    expect([on, frame(undefined)]).toEqual([off, off]);
    held.dispose();
  });

  it('keeps each beam spill with its own spot while the beams cast shadows', () => {
    const fixture = source({ ...beam, spill: profile });
    const dim = structuredClone(fixture.data.items[0]!);
    dim.id = 'dim_beam';
    dim.name = 'Dim fixture beam';
    dim.light.intensity = 0.001;
    dim.light.beam = { ...beam, spill: { ...profile, radiusRatio: 2.5 } };
    fixture.data.items.push(dim);
    expect(validateContent(fixture)).toEqual([]);
    const { registry, issues } = buildRegistry([fixture]);
    expect(issues).toEqual([]);
    const inventory = new Inventory(registry);
    const hand = inventory.create('dim_beam');
    const worn = inventory.create('fixture_beam');
    expect(inventory.add(hand, { kind: 'hand', side: 'left' })).toBe(true);
    expect(inventory.add(worn, { kind: 'worn' })).toBe(true);
    expect(toggleLight(registry, hand)).toBeUndefined();
    expect(toggleLight(registry, worn)).toBeUndefined();
    const held = beamAnchors();
    vi.spyOn(held, 'lensOf').mockImplementation((item, at) => {
      at.set(1, 2, 3);
      return item === hand;
    });
    const torch = new Flashlight(new Scene(), 2, CALIBRATED_NEAR_FIELD_M);
    torch.shadowsAllowed = true;
    const uniforms = UniformsUtils.clone(ShaderLib.lambert.uniforms);
    torch.update({ registry, inventory, lit: hand, held, camera: new PerspectiveCamera() });
    expect(torch.lights.map((light) => light.castShadow)).toEqual([true, true]);
    // The lit hand beam takes the first spot.
    expect(Array.from(uniforms.uFlashlightSpill!.value as Float32Array)).toEqual([
      Math.fround(2.5 ** 2),
      Math.fround(profile.intensity),
      Math.fround(profile.radiusRatio ** 2),
      Math.fround(profile.intensity),
    ]);
    expect(ShaderChunk.lights_fragment_begin).toContain('uFlashlightSpill[ i ]');
    held.dispose();
  });

  it('plain uniforms reproduce the unmodified cone across its hotspot, edge and exterior', () => {
    cone.installFlashlightSpill(1);
    cone.setFlashlightSpill([undefined]);
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

  it('reads the torchspill URL switch as on, off or follow content', async () => {
    const { spillSwitchFromSearch } = await import('../src/render/flashlight.ts');
    expect(spillSwitchFromSearch('?torchspill=1')).toBe(true);
    expect(spillSwitchFromSearch('?torchspill=0')).toBe(false);
    expect(spillSwitchFromSearch('')).toBeUndefined();
    expect(spillSwitchFromSearch('?torchspill=maybe')).toBeUndefined();
  });

  it('no base beam ships with spill enabled', () => {
    const base = 'src/content/base';
    const beams = readdirSync(base)
      .filter((file) => file.endsWith('.json'))
      .flatMap((file) => {
        const content = JSON.parse(readFileSync(`${base}/${file}`, 'utf8')) as ContentFile;
        return (content.items ?? []).filter((item) => item.light?.beam);
      });
    expect(beams.length).toBeGreaterThan(0);
    expect(beams.filter((item) => item.light?.beam?.spill?.enabled).map((item) => item.id)).toEqual([]);
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
    const first = new Flashlight(scene, 1, CALIBRATED_NEAR_FIELD_M);
    const once = ShaderChunk.lights_pars_begin;
    cone.installFlashlightSpill(1);
    expect(ShaderChunk.lights_pars_begin).toBe(once);
    expect(once).toContain('return mix( spill, 1.0, hotspot );');
    expect(scene.children.filter((child) => child.type === 'SpotLight')).toEqual([first.light]);
    expect(() => cone.withFlashlightSpill('changed upstream shader')).toThrow('spot attenuation not found');
  });
});
