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
  BoxGeometry,
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  type Material,
  Matrix4,
  Mesh,
  type MeshStandardMaterial,
  Plane,
  type Texture,
  Vector3,
} from 'three';
import type { MetallicCartridge } from '../ammo/cartridge.ts';
import { type Column, type FeedLips, feedLips, layoutColumn } from '../ammo/magazineColumn.ts';
import { lipCoverMm, roundProfiles } from '../ammo/roundProfile.ts';
import type { Report } from '../core/validate.ts';
import { magazineCenterline } from '../gun/magazineCenterline.ts';
import { type CaseFinish, finishes, revolvedGeometry, UNITS_PER_MM } from './ammoLayer.ts';

/**
 * All views stop the shell a little below the feed face and bend feed lips over the top round, which
 * stands proud of them as on a real magazine. lips: nothing else. cut: half the shell is clipped away,
 * which shows the whole column in section. xray: the shell turns translucent.
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
/** The shell's top cap, one wall thick, is cut away so the rounds come up through the top; the walls carry the lips. */
const LIP_DROP_U = MAGAZINE_WALL_U;
/** Where the detached copy stands: this far to the ejection side of the gun's own magazine. */
const DETACH_OFFSET_Z_U = 12;
const XRAY_OPACITY = 0.16;
const XRAY_LIP_OPACITY = 0.55;

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

/** The gun's near-black magazine reads as a hole in the scene, so the detached copy is lifted toward this grey. */
const SHELL_LIFT_COLOR = new Color(0x6a_72_80);
const SHELL_LIFT = 0.4;

/** A two-sided, lifted copy of a shell material. */
const shellMaterial = (source: MeshStandardMaterial): MeshStandardMaterial => {
  const material = source.clone();
  material.side = DoubleSide;
  material.color.lerp(SHELL_LIFT_COLOR, SHELL_LIFT);
  return material;
};

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
    const material = shellMaterial(mesh.material as MeshStandardMaterial);
    // Every view stops the shell at the lips; cut also clips half of it away.
    material.clippingPlanes = view === 'cut' ? [planes.lip, planes.side] : [planes.lip];
    if (view === 'xray') {
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

  const shell = shellFor(solids, id, options.view, planes);
  const group = new Group();
  group.add(shell, rounds);
  const [top] = column.rounds;
  const sample = shell.children[0] as Mesh | undefined;
  if (top && sample) {
    group.add(
      feedLipMeshes({
        lips: feedLips(top, diameter, MAGAZINE_WALL_U),
        halfWidth: line.width / 2,
        // From the body's rear face, over the straight body of the case, ending before the shoulder.
        headX: line.rearX,
        coverX: top.position[0] - length / 2 + lipCoverMm(cartridge) * UNITS_PER_MM - line.rearX,
        material: lipMaterial(sample.material as MeshStandardMaterial, options.view),
        world,
      }),
    );
  }
  return { group, column };
};

/** Opaque like the shell, except in x-ray, where the lips stay readable inside the faded shell. */
const lipMaterial = (shell: MeshStandardMaterial, view: MagazineView): MeshStandardMaterial => {
  const material = shell.clone();
  material.clippingPlanes = null;
  if (view === 'xray') {
    material.opacity = XRAY_LIP_OPACITY;
  }
  return material;
};

/**
 * The two lips as bent sheets: a riser up the side wall from the shell's cut, and a plate bent inward over
 * the top round at its underside height. They run along the round from its head over the straight body;
 * the shoulder, neck and bullet stand free.
 */
const feedLipMeshes = (input: {
  readonly lips: FeedLips;
  readonly halfWidth: number;
  readonly headX: number;
  readonly coverX: number;
  readonly material: MeshStandardMaterial;
  readonly world: Matrix4;
}): Group => {
  const { lips, halfWidth, headX, coverX, material, world } = input;
  const group = new Group();
  group.matrixAutoUpdate = false;
  group.matrix.copy(world);
  const top = lips.underside + lips.thickness;
  const midX = headX + coverX / 2;
  /** A box spanning the lips' length in x and the given y and z ranges. */
  const box = (y: readonly [number, number], z: readonly [number, number]): Mesh => {
    const mesh = new Mesh(new BoxGeometry(coverX, y[1] - y[0], z[1] - z[0]), material);
    mesh.position.set(midX, (y[0] + y[1]) / 2, (z[0] + z[1]) / 2);
    mesh.userData = { label: 'feed lip' };
    return mesh;
  };
  for (const side of [1, -1]) {
    const [near, far] = [lips.innerEdge * side, halfWidth * side].sort((a, b) => a - b) as [number, number];
    // Plate: from the inner edge out to the wall, its underside at the round's surface.
    group.add(box([lips.underside, top], [near, far]));
    // Riser: the wall from the shell's cut up to the plate.
    const wallInner = (halfWidth - lips.thickness) * side;
    const [wallNear, wallFar] = [wallInner, far].sort((a, b) => a - b) as [number, number];
    group.add(box([-LIP_DROP_U, top], [wallNear, wallFar]));
  }
  return group;
};
