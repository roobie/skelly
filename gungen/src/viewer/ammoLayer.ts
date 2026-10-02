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
import { meshForRevolved } from '../core/revolve.ts';
import type { Vec2 } from '../core/schema.ts';
import { UNITS_PER_MM } from '../gun/magazineGeometry.ts';

export const DEFAULT_ROUND_FACETS = 24;
const ROUND_CREASE_DEGREES = 12;
export type CaseFinish = 'steel' | 'brass';

export interface AmmoMeshes {
  readonly loose: Group;
  readonly fired: Group;
  readonly lengthUnits: number;
  readonly caseLengthUnits: number;
  readonly headDiameterUnits: number;
}

/** Build an image-based environment so polished case and jacket materials stay legible. */
export const ammoEnvironment = (renderer: WebGLRenderer): Texture => {
  const generator = new PMREMGenerator(renderer);
  const { texture } = generator.fromScene(new RoomEnvironment(), 0.04);
  generator.dispose();
  return texture;
};

const finishMaterials = (finish: CaseFinish, env: Texture) => {
  const lacqueredSteel = finish === 'steel';
  const casing = new MeshPhysicalMaterial(
    lacqueredSteel
      ? {
          color: new Color(0x3b_45_38),
          metalness: 0.5,
          roughness: 0.4,
          clearcoat: 0.6,
          clearcoatRoughness: 0.25,
        }
      : { color: new Color(0xcd_9f_4f), metalness: 1, roughness: 0.34 },
  );
  const jacket = new MeshPhysicalMaterial({ color: new Color(0xc9_80_55), metalness: 1, roughness: 0.3 });
  const primer = new MeshPhysicalMaterial({
    color: new Color(lacqueredSteel ? 0x8a_6b_43 : 0xa0_7a_35),
    metalness: 0.9,
    roughness: 0.45,
  });
  for (const material of [casing, jacket, primer]) {
    material.envMap = env;
    material.envMapIntensity = 1;
  }
  return { casing, jacket, primer };
};

const revolvedGeometry = (profile: readonly Vec2[], facets: number): BufferGeometry => {
  const mesh = meshForRevolved(
    {
      id: 'cartridge-component',
      kind: 'revolved',
      axis: 'x',
      profile: profile.map(([axial, radius]): Vec2 => [axial * UNITS_PER_MM, radius * UNITS_PER_MM]),
      creaseDegrees: ROUND_CREASE_DEGREES,
    },
    facets,
  );
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  return geometry;
};

/** Build the loose loaded round and fired case in real-size-derived gungen units, axis along +X. */
export const buildAmmoMeshes = (
  cartridge: MetallicCartridge,
  finish: CaseFinish,
  env: Texture,
  facets = DEFAULT_ROUND_FACETS,
): AmmoMeshes => {
  const profiles = roundProfiles(cartridge);
  const materials = finishMaterials(finish, env);
  const loose = new Group();
  loose.add(
    new Mesh(revolvedGeometry(profiles.loadedCase, facets), materials.casing),
    new Mesh(revolvedGeometry(profiles.primer, facets), materials.primer),
    new Mesh(revolvedGeometry(profiles.bullet, facets), materials.jacket),
  );
  const fired = new Group();
  fired.add(
    new Mesh(revolvedGeometry(profiles.firedCase, facets), materials.casing.clone()),
    new Mesh(revolvedGeometry(profiles.primer, facets), materials.primer.clone()),
  );
  const lengthMm = Math.max(...profiles.bullet.map(([axial]) => axial));
  const caseLengthMm = Math.max(...profiles.loadedCase.map(([axial]) => axial));
  const headDiameterMm = Math.max(...profiles.loadedCase.map(([, radius]) => radius)) * 2;
  return {
    loose,
    fired,
    lengthUnits: lengthMm * UNITS_PER_MM,
    caseLengthUnits: caseLengthMm * UNITS_PER_MM,
    headDiameterUnits: headDiameterMm * UNITS_PER_MM,
  };
};
