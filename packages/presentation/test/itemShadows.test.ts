import {
  BoxGeometry,
  DirectionalLight,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  type Light,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  SkinnedMesh,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { describe, expect, it } from 'vitest';
import { ChunkBatch } from '../src/render/chunkBatch.ts';
import type { ChunkMeshes } from '../src/render/chunks.ts';
import { Shadows } from '../src/render/shadows.ts';

function fixture() {
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  const source = new PointLight(0xff_ff_ff, 1, 10);
  source.userData.carried = false;
  const rig = new Group();
  const sun = new DirectionalLight();
  const batch = new ChunkBatch(new MeshBasicMaterial(), 1);
  const drawn: { light: Light; casters: readonly unknown[] }[] = [];
  const renderer = {
    getContext: () => ({ getExtension: () => null }),
    shadowMap: {
      render(lights: Light[], root: Scene) {
        for (const light of lights) {
          const { shadow } = light as PointLight;
          if (!(shadow.autoUpdate || shadow.needsUpdate)) {
            continue;
          }
          drawn.push({ light, casters: [...root.children] });
          shadow.map ??= new WebGLRenderTarget(1, 1);
          shadow.needsUpdate = false;
        }
      },
    },
  } as unknown as WebGLRenderer;
  let terrain: object[] = [];
  const chunks = { batch, selectShadowCasters: () => 0, shadowInputs: () => terrain } as unknown as ChunkMeshes;
  const shadows = new Shadows(renderer, scene, { light: sun, rig }, chunks);
  shadows.attachItems([source], () => [], { faceSize: 16, bias: 0, normalBiasMetres: 0, radius: 1, nearMetres: 0.1 });
  scene.add(source, batch);
  const frame = () => {
    scene.updateMatrixWorld(true);
    renderer.shadowMap.render([], scene, camera);
    return [...shadows.itemStats.redraws];
  };
  const blocker = () => {
    const mesh = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    mesh.castShadow = true;
    scene.add(mesh);
    return mesh;
  };
  return {
    scene,
    shadows,
    source,
    drawn,
    frame,
    blocker,
    replaceTerrain: () => {
      terrain = [{}];
    },
  };
}

describe('item shadow maps', () => {
  it('reuses unchanged dropped maps even if a model clone or an empty instance upload changes', () => {
    const f = fixture();
    const mesh = f.blocker();
    expect(f.frame()).toEqual([1]);
    expect(f.frame()).toEqual([0]);
    const clone = mesh.clone();
    f.scene.remove(mesh);
    f.scene.add(clone);
    expect(f.frame()).toEqual([0]);
    const empty = new InstancedMesh(mesh.geometry, mesh.material, 1);
    empty.castShadow = true;
    empty.count = 0;
    f.scene.add(empty);
    empty.instanceMatrix.needsUpdate = true;
    expect(f.frame()).toEqual([0]);
    const remote = f.blocker();
    remote.position.x = 100;
    expect(f.frame()).toEqual([0]);
    remote.position.x += 1;
    expect(f.frame()).toEqual([0]);
    f.source.position.x += 1;
    expect(f.frame()).toEqual([1]);
    f.replaceTerrain();
    expect(f.frame()).toEqual([1]);
  });

  it('reuses a stationary carried source but redraws its moving emitter and changing blockers', () => {
    const f = fixture();
    f.source.userData.carried = true;
    const door = f.blocker();
    expect(f.frame()).toEqual([1]);
    expect(f.frame()).toEqual([0]);
    f.source.position.x += 1;
    expect(f.frame()).toEqual([1]);
    expect(f.frame()).toEqual([0]);
    door.rotation.y = Math.PI / 2;
    expect(f.frame()).toEqual([1]);
    door.customDistanceMaterial = new MeshBasicMaterial();
    expect(f.frame()).toEqual([1]);
    expect(f.frame()).toEqual([1]);
  });

  it('refreshes on the same frame a door closes or a blocker is added or removed', () => {
    const f = fixture();
    const door = f.blocker();
    door.rotation.y = Math.PI / 2;
    f.frame();
    expect(f.frame()).toEqual([0]);
    door.rotation.y = 0;
    expect(f.frame()).toEqual([1]);
    expect(f.frame()).toEqual([0]);
    const added = f.blocker();
    expect(f.frame()).toEqual([1]);
    f.scene.remove(added);
    expect(f.frame()).toEqual([1]);
  });

  it('scans no casters for a dark lamp, and still redraws a world change made while it was dark', () => {
    const f = fixture();
    const mesh = f.blocker();
    expect(f.frame()).toEqual([1]);
    f.source.intensity = 0;
    // A scan would see the caster that joins in the dark and report the set rebuilt.
    f.blocker().position.x = 50;
    expect(f.frame()).toEqual([0]);
    expect(f.shadows.itemStats.rebuilt).toBe(false);
    mesh.position.x += 1;
    f.source.intensity = 1;
    expect(f.frame()).toEqual([1]);
    expect(f.shadows.itemStats.rebuilt).toBe(true);
    expect(f.frame()).toEqual([0]);
  });

  it('redraws when an instanced blocker uploads new placements, and only then', () => {
    const f = fixture();
    const mesh = f.blocker();
    const instanced = new InstancedMesh(mesh.geometry, mesh.material, 2);
    instanced.castShadow = true;
    f.scene.add(instanced);
    expect([f.frame(), f.frame()]).toEqual([[1], [0]]);
    instanced.setMatrixAt(1, new Matrix4().makeTranslation(1, 0, 0));
    instanced.instanceMatrix.needsUpdate = true;
    expect([f.frame(), f.frame()]).toEqual([[1], [0]]);
  });

  it('reaches a blocker whose own geometry is edited into reach, plain and instanced', () => {
    const f = fixture();
    const plain = f.blocker();
    plain.geometry = new BoxGeometry().translate(100, 0, 0);
    plain.geometry.computeBoundingSphere();
    const instanced = new InstancedMesh(new BoxGeometry().translate(100, 0, 0), new MeshBasicMaterial(), 1);
    instanced.castShadow = true;
    f.scene.add(instanced);
    f.frame();
    expect(f.drawn.at(-1)!.casters).not.toContain(plain);
    expect(f.drawn.at(-1)!.casters).not.toContain(instanced);
    // Same geometry objects: translate edits their positions and recomputes their bounds in place.
    plain.geometry.translate(-100, 0, 0);
    instanced.geometry.translate(-100, 0, 0);
    expect(f.frame()).toEqual([1]);
    expect(f.drawn.at(-1)!.casters).toContain(plain);
    expect(f.drawn.at(-1)!.casters).toContain(instanced);
  });

  it('notices instance placements replaced by an attribute at the same version', () => {
    const f = fixture();
    const instanced = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 1);
    instanced.castShadow = true;
    f.scene.add(instanced);
    expect([f.frame(), f.frame()]).toEqual([[1], [0]]);
    const placedAt = (x: number) => {
      const placements = new InstancedBufferAttribute(new Float32Array(16), 16);
      new Matrix4().makeTranslation(x, 0, 0).toArray(placements.array);
      expect(placements.version).toBe(instanced.instanceMatrix.version);
      return placements;
    };
    instanced.instanceMatrix = placedAt(1);
    expect(f.frame()).toEqual([1]);
    expect(f.drawn.at(-1)!.casters).toContain(instanced);
    instanced.instanceMatrix = placedAt(100);
    expect(f.frame()).toEqual([1]);
    expect(f.drawn.at(-1)!.casters).not.toContain(instanced);
  });

  it('keeps its caster set across frames and rebuilds it only when a caster joins, leaves or stops casting', () => {
    const f = fixture();
    const rebuilt = () => {
      f.frame();
      return f.shadows.itemStats.rebuilt;
    };
    const door = f.blocker();
    expect([rebuilt(), rebuilt()]).toEqual([true, false]);
    door.rotation.y = Math.PI / 2;
    f.scene.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()), new Group());
    expect(rebuilt()).toBe(false);
    const added = f.blocker();
    expect([rebuilt(), rebuilt()]).toEqual([true, false]);
    f.scene.remove(added);
    expect([rebuilt(), rebuilt()]).toEqual([true, false]);
    door.castShadow = false;
    expect([rebuilt(), rebuilt()]).toEqual([true, false]);
  });

  it('walks only in-range casters on cube faces while retaining unbounded shader casters', () => {
    const f = fixture();
    const local = f.blocker();
    const remote = Array.from({ length: 12 }, () => f.blocker());
    remote.forEach((mesh, index) => {
      mesh.position.set(100 + index, 0, 0);
    });
    const unbounded = remote[0]!;
    unbounded.frustumCulled = false;
    const skinned = new SkinnedMesh(new BoxGeometry(), new MeshBasicMaterial());
    skinned.castShadow = true;
    skinned.position.x = 100;
    f.scene.add(skinned);
    const edge = remote[1]!;
    edge.position.x = f.source.distance;
    f.frame();
    const { casters } = f.drawn.at(-1)!;
    expect(casters).toContain(local);
    expect(casters).toContain(unbounded);
    expect(casters).toContain(skinned);
    expect(casters).toContain(edge);
    expect(remote.slice(2).filter((mesh) => casters.includes(mesh))).toHaveLength(0);
    remote[2]!.position.x = 1;
    expect(f.frame()).toEqual([1]);
    expect(f.drawn.at(-1)!.casters).toContain(remote[2]);
  });

  it('flattens only visible casters and restores their original child ownership after drawing', () => {
    const f = fixture();
    const parent = f.blocker();
    const child = f.blocker();
    parent.add(child);
    const hidden = new Group();
    hidden.visible = false;
    hidden.add(f.blocker());
    f.scene.add(hidden, new Group());
    f.frame();
    expect(f.drawn.at(-1)?.casters).toContain(parent);
    expect(f.drawn.at(-1)?.casters).toContain(child);
    expect(f.drawn.at(-1)?.casters.every((caster) => caster instanceof Mesh)).toBe(true);
    expect(parent.children).toEqual([child]);
    expect(child.parent).toBe(parent);
    expect(f.drawn.at(-1)?.casters).not.toContain(hidden.children[0]);
  });
});
