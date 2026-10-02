// Deterministic firearm handling in the simulation. g34/g35 export data replaces this
// one stand-in; transient case motion is returned as an event and never enters save state.

import type { Vec3 } from '../core/coords.ts';
import type { Inventory } from '../core/inventory.ts';
import type { Item } from '../core/items.ts';
import { Rng } from '../core/random.ts';

export interface FirearmHandlingData {
  readonly calibre: string;
  /** Model-local metres: +x forward, +y up, +z to the shooter's right. */
  readonly ejection: {
    readonly at: Vec3;
    readonly direction: Vec3;
    readonly speed: number;
  };
  readonly cycle: { readonly rear: number; readonly dwell: number; readonly forward: number };
  readonly rpm: number;
}

/** Placeholder values for the AK/M4 handling pass, all replaced together by g34/g35 exports. */
export const FIREARM_HANDLING_STAND_IN: FirearmHandlingData = {
  calibre: '7.62x39',
  ejection: { at: [0.12, 0.06, 0.14], direction: [0.08, 0.22, 1], speed: 3.5 },
  cycle: { rear: 0.035, dwell: 0.015, forward: 0.05 },
  rpm: 600,
};

/** Gungen-generated entries will be keyed by Deadvox firearm item ID when those fields are exported. */
export const GUNGEN_FIREARM_HANDLING_EXPORTS: Readonly<Partial<Record<string, FirearmHandlingData>>> = {};

/** Export seam: use an exported model profile where available, otherwise the fingerprinted stand-in. */
export const firearmHandlingFor = (item: Item): FirearmHandlingData =>
  GUNGEN_FIREARM_HANDLING_EXPORTS[item.type] ?? FIREARM_HANDLING_STAND_IN;

export const spentCaseItemId = (calibre: string): string => `spent_case_${calibre.replaceAll('.', '_')}`;

export interface FirearmShotEffect {
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly speed: number;
  readonly seed: number;
}

export interface DebugFirearmShotInput {
  readonly debugMode: boolean;
  readonly inventory: Inventory;
  readonly item: Item;
  /** Feet and eye in simulation blocks. */
  readonly feet: Vec3;
  readonly eye: Vec3;
  readonly yaw: number;
  readonly pitch: number;
  readonly aim: Vec3;
  readonly seed: number;
  readonly simTime: number;
  readonly blockSize: number;
}

const magnitude = ([x, y, z]: Vec3): number => Math.hypot(x, y, z);
const unit = (v: Vec3): Vec3 => {
  const length = magnitude(v);
  return length > 0 ? [v[0] / length, v[1] / length, v[2] / length] : [0, 0, -1];
};

/** A debug-only shot: no hit scan, damage, ammunition or reload state. */
export const debugFirearmShot = (input: DebugFirearmShotInput): FirearmShotEffect | undefined => {
  if (!input.debugMode) {
    return undefined;
  }
  const data = firearmHandlingFor(input.item);
  const right: Vec3 = [Math.cos(input.yaw), 0, -Math.sin(input.yaw)];
  const forward = unit(input.aim);
  const up = unit([
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0],
  ]);
  const worldVector = (local: Vec3): Vec3 => [
    forward[0] * local[0] + up[0] * local[1] + right[0] * local[2],
    forward[1] * local[0] + up[1] * local[1] + right[1] * local[2],
    forward[2] * local[0] + up[2] * local[1] + right[2] * local[2],
  ];
  const eyeMetres: Vec3 = [
    input.eye[0] * input.blockSize,
    input.eye[1] * input.blockSize,
    input.eye[2] * input.blockSize,
  ];
  const offset = worldVector(data.ejection.at);
  const origin: Vec3 = [eyeMetres[0] + offset[0], eyeMetres[1] + offset[1], eyeMetres[2] + offset[2]];
  const direction = unit(worldVector(data.ejection.direction));

  // This deterministic ballistic estimate locates the saved pile. Presentation adds its own
  // seeded spread/spin and collision response without feeding any result back into simulation.
  const flightSeconds = 0.48;
  const flightDistance = data.ejection.speed * flightSeconds;
  const landing: Vec3 = [
    Math.floor((origin[0] + direction[0] * flightDistance) / input.blockSize),
    input.feet[1],
    Math.floor((origin[2] + direction[2] * flightDistance) / input.blockSize),
  ];
  const caseType = spentCaseItemId(data.calibre);
  const nearby = input.inventory
    .pilesNear(input.feet, 20 / input.blockSize)
    .find((pile) => pile.items.some(({ item }) => item.type === caseType));
  const pilePos = nearby?.pos ?? landing;
  if (!input.inventory.add(input.inventory.create(caseType), { kind: 'pile', pos: pilePos })) {
    throw new Error(`Could not add ${caseType} to pile ${pilePos.join(',')}`);
  }

  const shotKey = `${input.item.uid}:${input.simTime}:${input.feet.join(',')}`;
  const rng = Rng.stream(input.seed, `firearm-case:${shotKey}`);
  return { origin, direction, speed: data.ejection.speed, seed: Math.floor(rng.next() * 4_294_967_296) >>> 0 };
};
