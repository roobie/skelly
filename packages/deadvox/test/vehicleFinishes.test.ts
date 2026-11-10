import type { Sky } from '@skelly/engine/sky';
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
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { afterEach, expect, it, vi } from 'vitest';

const reflection = { texture: new Texture(), update: vi.fn() };
const colour = [0.5, 0.5, 0.5] as [number, number, number];
const coat = { amount: 0.7, roughness: 0.2, metallic: 0.05 };
const table = {
  coated: { colour, finish: { metallic: 0.6, roughness: 0.5, clearcoat: coat } },
  bare: { colour, finish: { metallic: 0.6, roughness: 0.5 } },
};

const meshOf = (materialId: string) => {
  const material = new MeshStandardMaterial({ metalness: 0.6, roughness: 0.5 });
  material.userData = { materialId };
  return new Mesh(new BoxGeometry(), material);
};

afterEach(() => {
  vi.restoreAllMocks();
});

it('leaves a vehicle on its shared materials while the option is off', () => {
  const finishes = new VehicleFinishes(reflection, table);
  const mesh = meshOf('coated');
  const { material } = mesh;
  finishes.dress(new Group().add(mesh));
  expect(mesh.material).toBe(material);
  expect(material.envMap).toBeNull();
});

it('reflects on a finished copy and never on the material other views share', () => {
  const finishes = new VehicleFinishes(reflection, table);
  finishes.setEnabled(true);
  const mesh = meshOf('bare');
  const shared = mesh.material;
  finishes.dress(new Group().add(mesh));
  expect(mesh.material).not.toBe(shared);
  expect((mesh.material as MeshStandardMaterial).envMap).toBe(reflection.texture);
  expect(shared.envMap).toBeNull();
});

it('takes a coat, and the metalness under it, only from the finish content', () => {
  const finishes = new VehicleFinishes(reflection, table);
  finishes.setEnabled(true);
  const [coated, bare] = [meshOf('coated'), meshOf('bare')];
  const shared = coated.material;
  finishes.dress(new Group().add(coated, bare));
  const material = coated.material as Material as MeshPhysicalMaterial;
  expect(material).toBeInstanceOf(MeshPhysicalMaterial);
  expect(material.clearcoat).toBe(coat.amount);
  expect(material.clearcoatRoughness).toBe(coat.roughness);
  expect(material.metalness).toBe(coat.metallic);
  expect(shared.metalness).toBe(table.coated.finish.metallic);
  expect(bare.material).not.toBeInstanceOf(MeshPhysicalMaterial);
  expect((bare.material as MeshStandardMaterial).metalness).toBe(table.bare.finish.metallic);
});

it('keeps one finished copy per shared material, so a rebuilt vehicle compiles and uploads nothing new', () => {
  const finishes = new VehicleFinishes(reflection, table);
  finishes.setEnabled(true);
  const first = meshOf('bare');
  const second = new Mesh(first.geometry, first.material);
  finishes.dress(new Group().add(first, second));
  expect(second.material).toBe(first.material);
});

it('follows the sky only while the option is on', () => {
  const update = vi.fn();
  const finishes = new VehicleFinishes({ texture: reflection.texture, update }, table);
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
  const skyDrift = 0.1;
  const gradient = new GradientSkyReflection({} as WebGLRenderer, {
    cubeSize: 16,
    skyDrift,
    zenithHeight: 0.5,
    groundEdge: 0.1,
  });
  const skyOf = (red: number) =>
    ({ sky: [red, 0, 0], heightFogColor: [0, 0, 0], ambientGround: [0, 0, 0] }) as unknown as Sky;
  const { texture } = gradient;
  gradient.update(skyOf(0.5));
  const drawn = bake.mock.calls.length;
  gradient.update(skyOf(0.5 + skyDrift / 2));
  expect(bake).toHaveBeenCalledTimes(drawn);
  gradient.update(skyOf(0.5 + skyDrift * 2));
  expect(bake).toHaveBeenCalledTimes(drawn + 1);
  expect(gradient.texture).toBe(texture);
});
