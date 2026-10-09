import type { Report } from '@skelly/engine/core/validate.ts';
import { DoubleSide, Group, InstancedMesh, type Material, Matrix4, Mesh } from 'three';
import type { MetallicCartridge } from '../ammo/cartridge.ts';
import { magazineRoundColumn } from '../gun/magazineGeometry.ts';
import type { AmmoMeshes } from './ammoLayer.ts';

const DETACH_OFFSET_Z_U = 12;
const matrixOf = (t: { readonly r: readonly number[]; readonly t: readonly number[] }): Matrix4 =>
  new Matrix4().set(
    t.r[0]!,
    t.r[1]!,
    t.r[2]!,
    t.t[0]!,
    t.r[3]!,
    t.r[4]!,
    t.r[5]!,
    t.t[1]!,
    t.r[6]!,
    t.r[7]!,
    t.r[8]!,
    t.t[2]!,
    0,
    0,
    0,
    1,
  );

const cloneTranslucent = (material: Material): Material => {
  const copy = material.clone();
  copy.transparent = true;
  copy.opacity = 0.28;
  copy.depthWrite = false;
  copy.side = DoubleSide;
  return copy;
};

const cloneMaterials = (material: Material | Material[]): Material | Material[] =>
  Array.isArray(material) ? material.map(cloneTranslucent) : cloneTranslucent(material);

/** Detached translucent shell and an instanced round column fitted to the actual generated magazine. */
export const buildDetachedMagazine = (
  report: Report,
  solids: Group,
  cartridge: MetallicCartridge,
  ammo: AmmoMeshes,
): { readonly group: Group; readonly capacity: number } | undefined => {
  const entry = [...report.resolved.placed].find(([part]) => report.resolved.defs.get(part)?.family === 'magazine');
  if (!entry) {
    return undefined;
  }
  const [id, placement] = entry;
  const def = report.resolved.defs.get(id)!;
  const params = Object.fromEntries(
    Object.entries(report.resolved.params.get(id) ?? {}).map(([key, param]) => [key, param.value]),
  );
  const { column } = magazineRoundColumn(def.displaySolids ?? def.solids, cartridge, params, def.solids);
  const world = new Matrix4().makeTranslation(0, 0, DETACH_OFFSET_Z_U).multiply(matrixOf(placement));

  const shell = new Group();
  shell.position.z = DETACH_OFFSET_Z_U;
  for (const child of solids.children) {
    const mesh = child as Mesh;
    if (typeof mesh.userData.label !== 'string' || !mesh.userData.label.startsWith(`${id} (`)) {
      continue;
    }
    const copy = mesh.clone(false);
    copy.material = cloneMaterials(mesh.material);
    copy.userData = { label: 'detached magazine' };
    shell.add(copy);
  }

  const roundLength = ammo.lengthUnits;
  const components = ammo.loose.children.filter((child): child is Mesh => child instanceof Mesh);
  const instances = components.map((component) => {
    const geometry = component.geometry.clone();
    geometry.translate(-roundLength / 2, 0, 0);
    return new InstancedMesh(geometry, cloneMaterials(component.material), column.capacity);
  });
  const rounds = new Group();
  rounds.matrixAutoUpdate = false;
  rounds.matrix.copy(world);
  const place = new Matrix4();
  const turn = new Matrix4();
  for (const [index, round] of column.rounds.entries()) {
    place.makeTranslation(round.position[0], round.position[1], round.z).multiply(turn.makeRotationZ(round.angle));
    for (const instance of instances) {
      instance.setMatrixAt(index, place);
    }
  }
  for (const instance of instances) {
    instance.instanceMatrix.needsUpdate = true;
    rounds.add(instance);
  }
  const group = new Group();
  group.add(shell, rounds);
  return { group, capacity: column.capacity };
};
