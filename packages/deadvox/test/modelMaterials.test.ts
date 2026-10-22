import { readdirSync, readFileSync } from 'node:fs';
import { MATERIALS } from '@skelly/thing-core/materials';
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  type Loader,
  type Material,
  Mesh,
  MeshStandardMaterial,
  NormalBlending,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { glowingCopy } from '../src/render/itemEmissive.ts';
import { applyModelMaterials, modelMaterialWarmUp } from '../src/render/modelMaterials.ts';
import { prepareModel } from '../src/render/models.ts';

const table = {
  fixture: {
    colour: [0.8, 0.4, 0.2] as [number, number, number],
    finish: { metallic: 0.3, roughness: 0.6 },
  },
};

it('prepares exported material references from shared content without losing the authored shade', () => {
  const [reference] = Object.entries(MATERIALS);
  if (!reference) {
    throw new Error('The shared material table has no fixture candidate');
  }
  const [materialId, definition] = reference;
  const material = new MeshStandardMaterial({
    color: 0xff_ff_ff,
    roughness: definition.finish.roughness === 0 ? 1 : 0,
    metalness: definition.finish.metallic === 0 ? 1 : 0,
  });
  const colourMultiplier = [0.5, 1, 0.25];
  material.userData = { materialId, colourMultiplier };
  const scene = new Group().add(new Mesh(new BoxGeometry(), material));
  prepareModel(
    { id: 'fixture', file: 'assets/models/fixture.glb', parts: { body: { massKg: 1, centreOfMass: [0, 0, 0] } } },
    scene,
  );
  const srgbToLinear = (value: number) => (value <= 0.040_45 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  for (const [index, channel] of material.color.toArray().entries()) {
    expect(channel).toBeCloseTo(srgbToLinear(definition.colour[index]! * colourMultiplier[index]!));
  }
  expect(material.metalness).toBe(definition.finish.metallic);
  expect(material.roughness).toBe(definition.finish.roughness);
  const before = material.color.clone();
  applyModelMaterials(scene, MATERIALS);
  expect(material.color).toEqual(before);
});

const MAP_KEY = /map$/i;

// What three.js keys a mesh's program on, short of scene-wide state (lights, fog, target, tone mapper).
const programKey = (mesh: Mesh, material: Material): string => {
  const fields = material as unknown as Record<string, unknown>;
  const maps = Object.keys(fields)
    .filter((key) => MAP_KEY.test(key) && fields[key])
    .map((key) => `${key}:${(fields[key] as Texture).channel}`)
    .sort();
  const { geometry } = mesh;
  return JSON.stringify([
    material.type,
    material.side,
    material.transparent || material.blending !== NormalBlending || material.alphaToCoverage,
    material.toneMapped,
    material.vertexColors,
    material.alphaTest > 0,
    material.alphaHash,
    material.premultipliedAlpha,
    material.dithering,
    fields.flatShading,
    fields.fog,
    maps,
    mesh instanceof InstancedMesh && mesh.instanceColor !== null,
    mesh.constructor.name,
    ['normal', 'tangent', 'color'].map((name) => geometry.getAttribute(name)?.itemSize),
    Object.keys(geometry.morphAttributes).sort(),
  ]);
};

it('warm-up stand-ins share a program with every material the pack models draw, lit or not, held or piled', async () => {
  const imageLoader = {
    isImageBitmapLoader: true,
    load(_url: string, onLoad: (image: ImageBitmap) => void) {
      onLoad({ width: 8, height: 8 } as ImageBitmap);
    },
  };
  Object.defineProperty(globalThis, 'self', { configurable: true, value: globalThis });
  // Embedded images bypass the manager's handlers, and node has no image decoder, so the parser's own
  // texture loader is stubbed; otherwise textured materials would load without their map.
  const loader = new GLTFLoader().register((parser) => {
    (parser as unknown as { textureLoader: Loader }).textureLoader = imageLoader as unknown as Loader;
    return { name: 'stub_images' };
  });
  const assets = 'src/content/base/assets';
  const files = readdirSync(assets, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.glb'));
  expect(files).not.toHaveLength(0);
  const scenes = await Promise.all(
    files.map(
      async (file) => (await loader.parseAsync(Uint8Array.from(readFileSync(`${assets}/${file}`)).buffer, '')).scene,
    ),
  );
  const meshes: Mesh[] = [];
  for (const scene of scenes) {
    applyModelMaterials(scene, MATERIALS);
    scene.traverse((object) => object instanceof Mesh && meshes.push(object));
  }
  const drawn = meshes.flatMap((mesh) =>
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).flatMap((material: Material) => [
      [mesh, material] as const,
      ...(material instanceof MeshStandardMaterial ? [[mesh, glowingCopy(material, 0xff_00_00, 2)] as const] : []),
    ]),
  );
  for (const instanced of [false, true]) {
    const warm = modelMaterialWarmUp(instanced).children as Mesh[];
    expect(warm.every((mesh) => !mesh.visible)).toBe(true);
    const warmed = new Set(warm.map((mesh) => programKey(mesh, mesh.material as Material)));
    const keys = drawn.flatMap(([mesh, material]) =>
      (instanced ? [mesh, new InstancedMesh(mesh.geometry, material, 1)] : [mesh]).map((shown) =>
        programKey(shown, material),
      ),
    );
    expect([...new Set(keys)].filter((key) => !warmed.has(key))).toEqual([]);
  }
});

describe('material reference validation', () => {
  it('rejects unknown material IDs and malformed colour multipliers', () => {
    for (const metadata of [
      { materialId: 'unknown', colourMultiplier: [1, 1, 1] },
      { materialId: 'fixture', colourMultiplier: [1, 1] },
      { materialId: 'fixture' },
      { colourMultiplier: [1, 1, 1] },
    ]) {
      const material = new MeshStandardMaterial();
      material.userData = metadata;
      expect(() => applyModelMaterials(new Group().add(new Mesh(new BoxGeometry(), material)), table)).toThrow();
    }
  });
});
