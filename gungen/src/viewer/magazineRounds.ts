// A detached copy of the gun's magazine, filled with rounds (roobie/skelly#109, spike).
//
// The rounds are drawn here, at render time, and are not assembly parts: a round placed as a part
// inside the magazine's solid body trips `solid-overlap` (checked: 1.75 u of penetration against an
// allowance of 0.75 u for a directly connected pair). Their path is the magazine's own centreline, read
// back from its generated solids (gun/magazineCenterline.ts), and the rounds are instanced: one
// InstancedMesh each for case, primer and bullet, at a low facet count because there are dozens.
//
// The shell is a clone of the gun's magazine meshes. The magazine body is a solid box, so rounds inside
// are hidden unless the shell is opened up; see `MagazineView`.

import {
  DoubleSide,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  type Mesh,
  type MeshStandardMaterial,
  Plane,
  type Texture,
  Vector3,
} from 'three';
import type { MetallicCartridge } from '../ammo/cartridge.ts';
import { type Column, layoutColumn } from '../ammo/magazineColumn.ts';
import { roundProfiles } from '../ammo/roundProfile.ts';
import type { Report } from '../core/validate.ts';
import { magazineCenterline } from '../gun/magazineCenterline.ts';
import { type CaseFinish, finishes, revolvedGeometry, UNITS_PER_MM } from './ammoLayer.ts';

/**
 * lips: the shell stops a little below the feed face, so the top rounds stand proud of the lips, as on
 * a real magazine. cut: half the shell is clipped away, which shows the whole column in section.
 * xray: the shell turns translucent.
 */
export type MagazineView = 'lips' | 'cut' | 'xray';

export const parseMagazineView = (value: string | null): MagazineView | undefined => {
  if (value === null) {
    return undefined;
  }
  return value === 'cut' || value === 'xray' ? value : 'lips';
};

/** ASSUMPTION: the magazine body is solid boxes, so there is no wall. This much of its section is taken as wall. */
export const MAGAZINE_WALL_U = 0.125;
/** The top round stands this fraction of its diameter above the feed face, held by the lips. */
const TOP_PROUD = 0.35;
/** In the lips view the shell is cut this far below the feed face. */
const LIP_DROP_U = 0.5;
/** Where the detached copy stands: this far to the ejection side of the gun's own magazine. */
const DETACH_OFFSET_Z_U = 12;
const XRAY_OPACITY = 0.16;

export interface DetachedMagazine {
  readonly group: Group;
  readonly column: Column;
}

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

/** Clone of the gun's magazine meshes, opened up according to `view`. */
const shellFor = (
  solids: Group,
  magazineId: string,
  view: MagazineView,
  planes: { readonly lip: Plane; readonly side: Plane },
): Group => {
  const shell = new Group();
  shell.position.z = DETACH_OFFSET_Z_U;
  for (const child of solids.children) {
    const mesh = child as Mesh;
    if (typeof mesh.userData.label !== 'string' || !mesh.userData.label.startsWith(`${magazineId} (`)) {
      continue;
    }
    // Not recursive: the edge outlines are children, and they would ignore the clipping.
    const copy = mesh.clone(false);
    const material = (mesh.material as MeshStandardMaterial).clone();
    material.side = DoubleSide;
    if (view === 'lips') {
      material.clippingPlanes = [planes.lip];
    } else if (view === 'cut') {
      material.clippingPlanes = [planes.side];
    } else {
      material.transparent = true;
      material.opacity = XRAY_OPACITY;
      material.depthWrite = false;
    }
    copy.material = material as Material;
    copy.userData = { label: 'detached magazine' };
    shell.add(copy);
  }
  return shell;
};

/** Builds the detached, loaded magazine for the first magazine in the report, or undefined if it has none we can read. */
export const buildDetachedMagazine = (
  report: Report,
  solids: Group,
  cartridge: MetallicCartridge,
  options: { readonly view: MagazineView; readonly finish: CaseFinish; readonly env: Texture; readonly facets: number },
): DetachedMagazine | undefined => {
  const { resolved } = report;
  const entry = [...resolved.placed].find(([part]) => resolved.defs.get(part)?.family === 'magazine');
  if (!entry) {
    return undefined;
  }
  const [id, placement] = entry;
  const def = resolved.defs.get(id)!;
  const line = magazineCenterline(def.displaySolids ?? def.solids);
  if (!line) {
    return undefined;
  }

  const profiles = roundProfiles(cartridge);
  const diameter = Math.max(...profiles.loadedCase.map(([, r]) => r)) * 2 * UNITS_PER_MM;
  const length = Math.max(...profiles.bullet.map(([z]) => z)) * UNITS_PER_MM;
  const column = layoutColumn({
    centerline: line.points,
    interiorWidth: line.width - 2 * MAGAZINE_WALL_U,
    roundDiameter: diameter,
    floor: MAGAZINE_WALL_U,
    topProud: TOP_PROUD * diameter,
  });

  // Magazine-local -> world, with the detached copy moved aside.
  const world = new Matrix4().makeTranslation(0, 0, DETACH_OFFSET_Z_U).multiply(matrixOf(placement));
  const planes = {
    lip: new Plane().setFromNormalAndCoplanarPoint(
      new Vector3(0, -1, 0).transformDirection(world),
      new Vector3(0, -LIP_DROP_U, 0).applyMatrix4(world),
    ),
    // Keeps the far half (z below the centre plane); the camera sits on the +z side by default.
    side: new Plane().setFromNormalAndCoplanarPoint(
      new Vector3(0, 0, -1).transformDirection(world),
      new Vector3(0, 0, 0).applyMatrix4(world),
    ),
  };

  const look = finishes(options.finish, options.env);
  const instanced = [
    { profile: profiles.loadedCase, material: look.caseMaterial },
    { profile: profiles.primer, material: look.primer },
    { profile: profiles.bullet, material: look.jacket },
  ].map(({ profile, material }) => {
    // Round axis along +X with the middle of the round at the origin, so an instance matrix places its centre.
    const geometry = revolvedGeometry(profile, options.facets);
    geometry.rotateY(Math.PI / 2);
    geometry.translate(-length / 2, 0, 0);
    return new InstancedMesh(geometry, material, column.rounds.length);
  });
  const rounds = new Group();
  rounds.matrixAutoUpdate = false;
  rounds.matrix.copy(world);
  const place = new Matrix4();
  const turn = new Matrix4();
  for (const [index, round] of column.rounds.entries()) {
    place.makeTranslation(round.position[0], round.position[1], round.z).multiply(turn.makeRotationZ(round.angle));
    for (const mesh of instanced) {
      mesh.setMatrixAt(index, place);
    }
  }
  for (const mesh of instanced) {
    mesh.instanceMatrix.needsUpdate = true;
    rounds.add(mesh);
  }

  const group = new Group();
  group.add(shellFor(solids, id, options.view, planes), rounds);
  return { group, column };
};
