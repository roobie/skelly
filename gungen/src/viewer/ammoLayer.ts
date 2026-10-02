// Draws a cartridge as revolved meshes at true scale beside the gun (roobie/skelly#109, spike).
// The profiles are in millimetres; one gun unit is 11.5 mm (core/exportFrame.ts), so a round built
// here is the size the real one would be next to the same gun.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  PMREMGenerator,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { MetallicCartridge } from '../ammo/cartridge.ts';
import { roundProfiles } from '../ammo/roundProfile.ts';
import { METRES_PER_UNIT } from '../core/exportFrame.ts';
import { meshForRevolved, scaleProfile } from '../core/revolve.ts';
import type { Vec2 } from '../core/schema.ts';

const UNITS_PER_MM = 1 / (METRES_PER_UNIT * 1000);
/** Facets around the axis. A round is about 1 u across, so this is a facet roughly every 0.13 u of rim. */
export const DEFAULT_ROUND_FACETS = 24;

/**
 * Profile bends sharper than this stay hard edges. The 7.62x39 shoulder bends 15 degrees at each end and
 * the ogive about 6 degrees per segment, so shoulder, rim, groove and mouth are edges and the ogive is smooth.
 */
const ROUND_CREASE_DEGREES = 12;

export type CaseFinish = 'steel' | 'brass';

interface Finish {
  readonly caseMaterial: MeshPhysicalMaterial;
  readonly jacket: MeshPhysicalMaterial;
  readonly primer: MeshPhysicalMaterial;
}

/** An image-based light: without one a metal has nothing to reflect and renders near black. */
export const ammoEnvironment = (renderer: WebGLRenderer): Texture => {
  const generator = new PMREMGenerator(renderer);
  const { texture } = generator.fromScene(new RoomEnvironment(), 0.04);
  generator.dispose();
  return texture;
};

const finishes = (finish: CaseFinish, env: Texture): Finish => {
  const lacquered = finish === 'steel';
  const caseMaterial = lacquered
    ? // Lacquered steel, the 7.62x39 norm: a dark green-grey lacquer over steel, glossy from its clear coat.
      new MeshPhysicalMaterial({
        color: new Color(0x3b_45_38),
        metalness: 0.5,
        roughness: 0.4,
        clearcoat: 0.6,
        clearcoatRoughness: 0.25,
      })
    : new MeshPhysicalMaterial({ color: new Color(0xcd_9f_4f), metalness: 1, roughness: 0.34 });
  // Gilding-metal (copper-washed) jacket.
  const jacket = new MeshPhysicalMaterial({ color: new Color(0xc9_80_55), metalness: 1, roughness: 0.3 });
  // Slightly darker and duller than the case it sits in.
  const primer = new MeshPhysicalMaterial({
    color: new Color(lacquered ? 0x8a_6b_43 : 0xa0_7a_35),
    metalness: 0.9,
    roughness: 0.45,
  });
  for (const material of [caseMaterial, jacket, primer]) {
    material.envMap = env;
    material.envMapIntensity = 1;
  }
  return { caseMaterial, jacket, primer };
};

const revolved = (profile: readonly Vec2[], facets: number, material: MeshPhysicalMaterial): Mesh => {
  const mesh = meshForRevolved({
    id: 'round',
    kind: 'revolved',
    profile: scaleProfile(profile, UNITS_PER_MM),
    facets,
    creaseDegrees: ROUND_CREASE_DEGREES,
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  return new Mesh(geometry, material);
};

export interface AmmoMeshes {
  /** A loaded round: case, primer and bullet. */
  readonly loose: Group;
  /** A fired case: open at the mouth, with its primer. */
  readonly fired: Group;
  /** Loaded round length, case length and case head diameter, in gun units. */
  readonly lengthUnits: number;
  readonly caseLengthUnits: number;
  readonly headDiameterUnits: number;
}

/**
 * Builds both rounds with the head face at the origin and the axis along +X (the bore direction),
 * the tip forward, so they line up with a gun built in gungen's frame.
 */
export const buildAmmoMeshes = (
  cartridge: MetallicCartridge,
  finish: CaseFinish,
  env: Texture,
  facets: number = DEFAULT_ROUND_FACETS,
): AmmoMeshes => {
  const profiles = roundProfiles(cartridge);
  const look = finishes(finish, env);
  const loose = new Group();
  loose.add(
    revolved(profiles.loadedCase, facets, look.caseMaterial),
    revolved(profiles.primer, facets, look.primer),
    revolved(profiles.bullet, facets, look.jacket),
  );
  const fired = new Group();
  fired.add(revolved(profiles.firedCase, facets, look.caseMaterial), revolved(profiles.primer, facets, look.primer));
  // Local +Z (the revolve axis) onto +X.
  for (const group of [loose, fired]) {
    group.rotation.y = Math.PI / 2;
  }
  const head = Math.max(...profiles.loadedCase.map(([, r]) => r)) * 2;
  const length = Math.max(...profiles.bullet.map(([z]) => z));
  const caseLength = Math.max(...profiles.loadedCase.map(([z]) => z));
  return {
    loose,
    fired,
    lengthUnits: length * UNITS_PER_MM,
    caseLengthUnits: caseLength * UNITS_PER_MM,
    headDiameterUnits: head * UNITS_PER_MM,
  };
};
