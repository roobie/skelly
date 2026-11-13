import type { Sky } from '@skelly/engine/sky';
import { MaterialPatches } from '@skelly/presentation/internal/render/materialPatches.ts';
import { GradientSkyReflection } from '@skelly/presentation/internal/render/skyReflection.ts';
import { VehicleFinishes } from '@skelly/presentation/internal/render/vehicleFinishes.ts';
import {
  BoxGeometry,
  Group,
  type Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PMREMGenerator,
  Texture,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { afterEach, expect, it, vi } from 'vitest';

const reflection = { texture: new Texture(), update: vi.fn() };
const grazingLimit = 0.25;
const colour = [0.5, 0.5, 0.5] as [number, number, number];
const coat = { amount: 0.7, roughness: 0.2, metallic: 0.05 };
const table = {
  coated: { colour, finish: { metallic: 0.6, roughness: 0.5, clearcoat: coat } },
  bare: { colour, finish: { metallic: 0.6, roughness: 0.5 } },
};

const gradientTuning = { cubeSize: 16, skyDrift: 0.1, zenithHeight: 0.5, groundEdge: 0.1, strength: 1, horizonGain: 2 };
const renderer = (domElement: EventTarget = new EventTarget()) => ({ domElement }) as unknown as WebGLRenderer;

const meshOf = (materialId: string) => {
  const material = new MeshStandardMaterial({ metalness: 0.6, roughness: 0.5 });
  material.userData = { materialId };
  return new Mesh(new BoxGeometry(), material);
};

const finishesOf = (patches = new MaterialPatches(), update = reflection.update) =>
  new VehicleFinishes({ texture: reflection.texture, update }, table, grazingLimit, patches);

afterEach(() => {
  vi.restoreAllMocks();
});

it('leaves a vehicle on its shared materials while the option is off', () => {
  const finishes = finishesOf();
  const mesh = meshOf('coated');
  const { material } = mesh;
  finishes.dress(new Group().add(mesh));
  expect(mesh.material).toBe(material);
  expect(material.envMap).toBeNull();
});

it('reflects on a finished copy and never on the material other views share', () => {
  const finishes = finishesOf();
  finishes.setEnabled(true);
  const mesh = meshOf('coated');
  const shared = mesh.material;
  finishes.dress(new Group().add(mesh));
  expect(mesh.material).not.toBe(shared);
  expect((mesh.material as MeshStandardMaterial).envMap).toBe(reflection.texture);
  expect(shared.envMap).toBeNull();
});

it('takes a coat, and the metalness under it, only from the finish content', () => {
  const finishes = finishesOf();
  finishes.setEnabled(true);
  const [coated, bare] = [meshOf('coated'), meshOf('bare')];
  const shared = coated.material;
  const uncoated = bare.material;
  finishes.dress(new Group().add(coated, bare));
  const material = coated.material as Material as MeshPhysicalMaterial;
  expect(material).toBeInstanceOf(MeshPhysicalMaterial);
  expect(material.clearcoat).toBe(coat.amount);
  expect(material.clearcoatRoughness).toBe(coat.roughness);
  expect(material.metalness).toBe(coat.metallic);
  expect(shared.metalness).toBe(table.coated.finish.metallic);
  expect(bare.material).toBe(uncoated);
});

it('keeps one finished copy per shared material, so a rebuilt vehicle compiles and uploads nothing new', () => {
  const finishes = finishesOf();
  finishes.setEnabled(true);
  const first = meshOf('coated');
  const shared = first.material;
  const second = new Mesh(first.geometry, shared);
  finishes.dress(new Group().add(first, second));
  expect(first.material).not.toBe(shared);
  expect(second.material).toBe(first.material);
});

it('reflects from the coat alone and caps its grazing reflectance, so the paint under it keeps its colour', () => {
  const patches = new MaterialPatches();
  const finishes = finishesOf(patches);
  finishes.setEnabled(true);
  const mesh = meshOf('coated');
  const model = new Group().add(mesh);
  finishes.dress(model);
  patches.apply(model);
  const maps = '#include <lights_fragment_maps>';
  const shader = {
    fragmentShader: `#include <lights_physical_fragment>\n${maps}`,
  } as WebGLProgramParametersWithUniforms;
  (mesh.material as Material).onBeforeCompile(shader, {} as WebGLRenderer);
  const afterMaps = shader.fragmentShader.slice(shader.fragmentShader.indexOf(maps) + maps.length);
  expect(afterMaps).toContain('radiance = vec3( 0.0 );');
  expect(afterMaps).toContain('iblIrradiance = vec3( 0.0 );');
  expect(shader.fragmentShader).toContain(`material.clearcoatF90 = ${grazingLimit.toFixed(4)};`);
});

it('leaves an unfinished material to compile as it would without the option', () => {
  const patches = new MaterialPatches();
  finishesOf(patches);
  const mesh = meshOf('bare');
  const { onBeforeCompile } = mesh.material;
  patches.apply(new Group().add(mesh));
  expect(mesh.material.onBeforeCompile).toBe(onBeforeCompile);
});

it('follows the sky only while the option is on', () => {
  const update = vi.fn();
  const finishes = finishesOf(new MaterialPatches(), update);
  const sky = {} as Sky;
  finishes.update(sky);
  expect(update).not.toHaveBeenCalled();
  finishes.setEnabled(true);
  finishes.update(sky);
  expect(update).toHaveBeenCalledWith(sky);
});

it('redraws the reflection when the sky drifts past the threshold, into the texture materials already hold', () => {
  const target = new WebGLRenderTarget(1, 1);
  const bake = vi.spyOn(PMREMGenerator.prototype, 'fromEquirectangular').mockReturnValue(target);
  const { skyDrift } = gradientTuning;
  const gradient = new GradientSkyReflection(renderer(), {
    ...gradientTuning,
  });
  const skyOf = (red: number) =>
    ({ sky: [red, 0, 0], heightFogColor: [0, 0, 0], ambientGround: [0, 0, 0], ambientIntensity: 1 }) as unknown as Sky;
  const { texture } = gradient;
  gradient.update(skyOf(0.5));
  const drawn = bake.mock.calls.length;
  gradient.update(skyOf(0.5 + skyDrift / 2));
  expect(bake).toHaveBeenCalledTimes(drawn);
  gradient.update(skyOf(0.5 + skyDrift * 2));
  expect(bake).toHaveBeenCalledTimes(drawn + 1);
  expect(gradient.texture).toBe(texture);
  expect(bake.mock.lastCall?.[1]).toBe(target);
});

it('draws the reflection again once a lost graphics context comes back', () => {
  const target = new WebGLRenderTarget(1, 1);
  const bake = vi.spyOn(PMREMGenerator.prototype, 'fromEquirectangular').mockReturnValue(target);
  const canvas = new EventTarget();
  // biome-ignore lint/correctness/noUnusedInstantiation: constructing it subscribes to the canvas's context events.
  new GradientSkyReflection(renderer(canvas), gradientTuning);
  const drawn = bake.mock.calls.length;
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  expect(bake).toHaveBeenCalledTimes(drawn + 1);
  expect(bake.mock.lastCall?.[1]).toBe(target);
});
