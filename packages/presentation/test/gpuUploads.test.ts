import {
  BufferAttribute,
  BufferGeometry,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Scene,
  type WebGLRenderer,
} from 'three';
import { expect, it, vi } from 'vitest';
import { GpuUploads } from '../src/render/gpuUploads.ts';

it('bounds uploads per frame, shares buffer identities and uploads changed versions before readiness', () => {
  const seen: BufferAttribute[] = [];
  const renderer = {
    autoClear: true,
    render: vi.fn((staging: Scene) => {
      const mesh = staging.children[0] as Mesh;
      expect(renderer.autoClear).toBe(false);
      // WebGLGeometries uploads attributes before renderBufferDirect checks the draw count.
      seen.push(...(Object.values(mesh.geometry.attributes) as BufferAttribute[]));
      const { count } = mesh.geometry.drawRange;
      if (count < 0 || count === Number.POSITIVE_INFINITY) {
        return;
      }
      // Only WebGLBindingStates.setup uploads the index, even for a zero-count draw.
      expect(count).toBe(0);
      const activePosition = mesh.geometry.getAttribute('position');
      if (activePosition) {
        expect(activePosition.itemSize).toBeLessThanOrEqual(4);
      }
      if (mesh.geometry.index) {
        seen.push(mesh.geometry.index);
      }
    }),
  };
  const geometry = new BufferGeometry();
  const position = new BufferAttribute(new Float32Array(9), 3);
  const normal = new BufferAttribute(new Float32Array(9), 3);
  const index = new BufferAttribute(new Uint32Array([0, 1, 2]), 1);
  geometry.setAttribute('position', position);
  geometry.setAttribute('normal', normal);
  geometry.setIndex(index);
  const scene = new Scene();
  const material = new MeshBasicMaterial();
  const instance = new InstancedMesh(geometry, material, 1);
  scene.add(new Mesh(geometry, material), new Mesh(geometry, material), instance);
  const uploads = new GpuUploads(renderer as unknown as WebGLRenderer, 2);
  expect(uploads.step([scene])).toBe(false);
  expect(seen).toEqual([position, normal]);
  expect(renderer.autoClear).toBe(true);
  expect(uploads.step([scene])).toBe(true);
  expect(seen).toEqual([position, normal, index, instance.instanceMatrix]);
  position.needsUpdate = true;
  expect(uploads.step([scene])).toBe(true);
  expect(seen).toEqual([position, normal, index, instance.instanceMatrix, position]);
  expect(uploads.step([scene])).toBe(true);
  expect(renderer.render).toHaveBeenCalledTimes(seen.length);
  uploads.dispose();
  expect(geometry.getAttribute('position')).toBe(position);
});
