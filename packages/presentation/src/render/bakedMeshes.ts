// A still tree drawn as one mesh per look instead of one per node, so the scene graph walk and every draw pass,
// the sun's shadow above all, see a handful of objects instead of the whole tree.

import { type BufferGeometry, Group, type Material, Matrix4, Mesh, type Object3D } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** What a merged mesh must share with every mesh it stands in for to draw them the same. */
const lookKey = (mesh: Mesh, mirrored: boolean): string => {
  const { geometry, material } = mesh;
  return [
    // A mesh with several materials keeps its geometry groups, so it bakes alone.
    Array.isArray(material) ? mesh.uuid : material.uuid,
    Object.keys(geometry.attributes).sort().join(','),
    geometry.index ? 'indexed' : 'flat',
    mesh.layers.mask,
    mesh.castShadow,
    mesh.receiveShadow,
    mesh.renderOrder,
    mesh.frustumCulled,
    mirrored,
  ].join('|');
};

/**
 * A mirrored placement flips the triangles' winding, which three.js answers from the object's own matrix. Baked
 * geometry is mirrored back here and its mesh mirrored again, so the renderer still sees the flip and keeps faces
 * facing out.
 */
const MIRROR = new Matrix4().makeScale(-1, 1, 1);

interface Look {
  source: Mesh;
  mirrored: boolean;
  geometries: BufferGeometry[];
}

/**
 * A still stand-in for `root`: a group with root's own transform holding one mesh per look among root's visible
 * meshes, their geometry placed in root's frame. Materials stay shared with the source; the stand-in owns its
 * geometry, which `disposeBaked` frees.
 */
export const bakeMeshes = (root: Object3D): Group => {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const looks = new Map<string, Look>();
  root.traverseVisible((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    const matrix = toRoot.clone().multiply(object.matrixWorld);
    const mirrored = matrix.determinant() < 0;
    if (mirrored) {
      matrix.premultiply(MIRROR);
    }
    const key = lookKey(object, mirrored);
    const look: Look = looks.get(key) ?? { source: object, mirrored, geometries: [] };
    look.geometries.push(object.geometry.clone().applyMatrix4(matrix));
    looks.set(key, look);
  });
  const baked = new Group();
  baked.position.copy(root.position);
  baked.quaternion.copy(root.quaternion);
  baked.scale.copy(root.scale);
  for (const { source, mirrored, geometries } of looks.values()) {
    baked.add(bakedMesh(source, mirrored, geometries));
  }
  return baked;
};

const bakedMesh = (source: Mesh, mirrored: boolean, geometries: BufferGeometry[]): Mesh => {
  let geometry = geometries[0]!;
  if (geometries.length > 1) {
    const merged = mergeGeometries(geometries, false);
    for (const part of geometries) {
      part.dispose();
    }
    if (!merged) {
      throw new Error(`meshes sharing material "${(source.material as Material).name}" can't be merged`);
    }
    geometry = merged;
  }
  const mesh = new Mesh(geometry, source.material);
  mesh.layers.mask = source.layers.mask;
  mesh.castShadow = source.castShadow;
  mesh.receiveShadow = source.receiveShadow;
  mesh.renderOrder = source.renderOrder;
  mesh.frustumCulled = source.frustumCulled;
  if (mirrored) {
    mesh.scale.x = -1;
  }
  return mesh;
};

/** Frees the geometry `bakeMeshes` made for `baked`; the shared materials stay. */
export const disposeBaked = (baked: Group): void => {
  baked.traverse((object) => {
    if (object instanceof Mesh) {
      object.geometry.dispose();
    }
  });
};
