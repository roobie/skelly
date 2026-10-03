// Deterministic firearm handling in the simulation. g34/g35 export data replaces this
// one stand-in; transient case motion is returned as an event and never enters save state.

import type { Registry } from '../core/content.ts';
import type { Vec3 } from '../core/coords.ts';
import type { Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { Rng } from '../core/random.ts';
import { pilesInRadius } from '../core/reach.ts';

export interface FirearmHandlingData {
  readonly calibre: string;
  /** Gungen's case GLB for this calibre, when exported. */
  readonly caseModelId?: string;
  /** Model-local metres: +x forward, +y up, +z to the shooter's right. */
  readonly ejection: {
    readonly at: Vec3;
    readonly direction: Vec3;
    readonly speed: number;
  };
  readonly cycle: { readonly rear: number; readonly dwell: number; readonly forward: number };
  readonly rpm: number;
}

/** Remaining handling stand-ins; g34 supplies calibre and case models, while g35 will add ejection/cycle data. */
export const FIREARM_HANDLING_STAND_IN: FirearmHandlingData = {
  calibre: '5.56x45',
  ejection: { at: [0.12, 0.06, 0.14], direction: [0.08, 0.22, 1], speed: 3.5 },
  cycle: { rear: 0.035, dwell: 0.015, forward: 0.05 },
  rpm: 600,
};

/** AR range stand-in: retain the phase proportions at 800 rpm until g35 exports timing. */
const AR_HANDLING_STAND_IN: FirearmHandlingData = {
  ...FIREARM_HANDLING_STAND_IN,
  rpm: 800,
  cycle: { rear: 0.026_25, dwell: 0.011_25, forward: 0.0375 },
};

/** Exact shot deadlines sampled by the existing player scheduler; no wall-clock timers. */
export class DebugFirearmTrigger {
  private burst: { uid: number; rpm: number; start: number; next: number } | undefined;

  advance(time: number, weapon: { uid: number; rpm: number } | undefined, pressed: boolean, held: boolean): number[] {
    if (!(weapon && (pressed || held))) {
      this.burst = undefined;
      return [];
    }
    // Preserve a quick click released between player ticks, without latching it on.
    if (!held) {
      this.burst = undefined;
      return [time];
    }
    if (pressed || !this.burst || this.burst.uid !== weapon.uid || this.burst.rpm !== weapon.rpm) {
      this.burst = { ...weapon, start: time, next: 0 };
    }
    const interval = 60 / weapon.rpm;
    const shots: number[] = [];
    let deadline = this.burst.start + this.burst.next * interval;
    while (deadline <= time + 1e-9) {
      shots.push(deadline);
      this.burst.next += 1;
      deadline = this.burst.start + this.burst.next * interval;
    }
    return shots;
  }
}

/** One seam joins the held model's g34 metadata to its exported case GLB, with explicit stand-in fallback. */
export const firearmHandlingFor = (item: Item, registry: Registry): FirearmHandlingData => {
  const itemModelId = defOf(registry, item.type).model;
  const gunModel = itemModelId === undefined ? undefined : registry.models.get(itemModelId);
  if (gunModel?.calibre === undefined) {
    return FIREARM_HANDLING_STAND_IN;
  }
  const [caseModelId] = [...registry.models.values()]
    .filter((model) => model.calibre === gunModel.calibre && model.id.startsWith('case_'))
    .map((model) => model.id)
    .sort();
  return {
    ...(itemModelId === 'rifle_assault' ? AR_HANDLING_STAND_IN : FIREARM_HANDLING_STAND_IN),
    calibre: gunModel.calibre,
    ...(caseModelId === undefined ? {} : { caseModelId }),
  };
};

const calibreSlug = (calibre: string): string =>
  [...calibre]
    .map((character) => {
      switch (character) {
        case '.':
          return '_d_';
        case '-':
          return '_h_';
        case '_':
          return '_u_';
        default:
          return character;
      }
    })
    .join('');

/** Collision-free item slug, matching gungen/ammo/calibreSlug.ts. */
export const spentCaseItemId = (calibre: string): string => `spent_case_${calibreSlug(calibre)}`;

export interface FirearmShotEffect {
  readonly origin: Vec3;
  readonly caseModelId?: string;
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
  const data = firearmHandlingFor(input.item, input.inventory.registry);
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
  const nearby = pilesInRadius(input.inventory, input.feet, 20 / input.blockSize).find((pile) =>
    pile.items.some(({ item }) => item.type === caseType),
  );
  const pilePos = nearby?.pos ?? landing;
  if (!input.inventory.add(input.inventory.create(caseType), { kind: 'pile', pos: pilePos })) {
    throw new Error(`Could not add ${caseType} to pile ${pilePos.join(',')}`);
  }

  const shotKey = `${input.item.uid}:${input.simTime}:${input.feet.join(',')}`;
  const rng = Rng.stream(input.seed, `firearm-case:${shotKey}`);
  return {
    origin,
    direction,
    speed: data.ejection.speed,
    seed: Math.floor(rng.next() * 4_294_967_296) >>> 0,
    ...(data.caseModelId === undefined ? {} : { caseModelId: data.caseModelId }),
  };
};
