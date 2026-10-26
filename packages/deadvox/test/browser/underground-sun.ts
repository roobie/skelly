import {
  BoxGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshLambertMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import type { MeshData } from '../../src/core/mesher.ts';
import { ChunkMeshes } from '../../src/render/chunks.ts';
import { Shadows } from '../../src/render/shadows.ts';
import { skyWorldFixture } from '../fixtures/skyWorld.ts';

function slab(thickness: number): MeshData {
  const geometry = new BoxGeometry(256, thickness, 256);
  geometry.translate(0, 4 + thickness / 2, 0);
  const positions = new Float32Array(geometry.getAttribute('position').array);
  const normals = Int8Array.from(geometry.getAttribute('normal').array, (value) => value * 127);
  const count = positions.length / 3;
  const indices = new Uint32Array(geometry.index!.array);
  geometry.dispose();
  return {
    positions,
    normals,
    indices,
    colors: new Uint8Array(count * 3).fill(255),
    patterns: new Uint8Array(count),
    weatherable: new Uint8Array(count),
    occlusion: new Uint8Array(count).fill(255),
    weathering: new Float32Array(count * 2),
  };
}

/** A bounded sun map must shade a buried receiver even when the solid's entry face is beyond its near plane. */
export function undergroundSunProof() {
  const renderer = new WebGLRenderer();
  const scene = new Scene();
  const meshes = new ChunkMeshes(1, skyWorldFixture().registry);
  scene.add(meshes.group);
  const floor = new Mesh(new PlaneGeometry(2, 2), new MeshLambertMaterial());
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const light = new DirectionalLight(0xff_ff_ff, 1);
  light.position.set(0.3, 1, 0.2).normalize();
  const rig = new Group();
  rig.add(light, light.target);
  scene.add(rig);
  const shadows = new Shadows(renderer, scene, { light, rig }, meshes);
  shadows.restore({ sun: true, torch: false, distance: 24 });
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 4);
  camera.position.set(0, 2, 0);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const target = new WebGLRenderTarget(16, 16);
  const pixels = new Uint8Array(16 * 16 * 4);
  const sample = () => {
    meshes.cull(camera);
    shadows.update(1, new Vector3(0, 1.6, 0));
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, 16, 16, pixels);
    return Array.from({ length: 256 }, (_, i) => pixels[i * 4]! + pixels[i * 4 + 1]! + pixels[i * 4 + 2]!);
  };
  try {
    const exposed = sample();
    meshes.set('roof', [0, 0, 0], slab(1));
    const roofed = sample();
    meshes.set('roof', [0, 0, 0], slab(256));
    const buried = sample();
    if (!(exposed.every((value) => value > 0) && roofed.every((value) => value === 0))) {
      throw new Error('Sun controls must light an exposed floor and shade every texel under a thin roof');
    }
    if (!buried.every((value) => value === 0)) {
      throw new Error(`Buried floor must receive no sun when the entry face is clipped: ${Math.max(...buried)}`);
    }
    return { exposed: Math.min(...exposed), roofed: Math.max(...roofed), buried: Math.max(...buried) };
  } finally {
    meshes.remove('roof');
    meshes.material.dispose();
    floor.geometry.dispose();
    floor.material.dispose();
    light.shadow.dispose();
    target.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
