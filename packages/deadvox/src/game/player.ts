// The player's body and movement, specified in metres and converted to blocks.

import type { LadderHoldState } from '../core/ladders.ts';
import type { Body, PhysicsParams } from '../core/physics.ts';
import type { PlayerStance } from '../core/playerStance.ts';
import type { Scale } from '../core/scale.ts';
import { freezeSnapshot } from '../core/snapshotData.ts';

/** Player constants in metres and metres per second (`DESIGN.md`, "Performance and scale"). */
export const PLAYER = {
  halfWidth: 0.3,
  height: 1.8,
  eye: 1.62,
  walk: 1.8,
  jog: 4.3,
  sprint: 6.5,
  /** Take-off speed; with GRAVITY it clears about 1.1 m. */
  jump: 7.9,
  reach: 4,
  stepHeight: 0.5,
} as const;

/** m/s². Heavier than Earth's; it makes jumps feel snappy. */
const GRAVITY = 28;

export const physicsFor = (scale: Scale): PhysicsParams => ({
  gravity: GRAVITY / scale.blockSize,
  stepHeight: PLAYER.stepHeight / scale.blockSize,
});

/** A player body at (x, y, z) in blocks, sized for the block size. */
export const createPlayerBody = (scale: Scale, x: number, y: number, z: number): Body => ({
  pos: [x, y, z],
  vel: [0, 0, 0],
  halfWidth: PLAYER.halfWidth / scale.blockSize,
  height: PLAYER.height / scale.blockSize,
  onGround: false,
});

/** Which stance key was pressed; `DESIGN.md`, "Crouching and lying prone". */
export type StanceToggle = 'crouch' | 'prone';

/** The stance a key press asks for: crouch toggles standing, prone toggles a crouch, and either rises from prone. */
export const nextStance = (stance: PlayerStance, toggle: StanceToggle | undefined): PlayerStance => {
  if (toggle === undefined) {
    return stance;
  }
  if (stance === 'prone') {
    return 'crouching';
  }
  if (toggle === 'prone') {
    return 'prone';
  }
  return stance === 'crouching' ? 'standing' : 'crouching';
};

export interface PlayerState {
  body: Body;
  yaw: number;
  pitch: number;
  walk: boolean;
  stance: PlayerStance;
  sprinting: boolean;
  firearmReadyWalking: boolean;
  handlingPausedForKnockout: boolean;
  ladder: LadderHoldState | null;
}

export const snapshotPlayer = (body: Body, state: Omit<PlayerState, 'body'>): Readonly<PlayerState> =>
  freezeSnapshot({
    body: {
      pos: [...body.pos],
      vel: [...body.vel],
      halfWidth: body.halfWidth,
      height: body.height,
      onGround: body.onGround,
    },
    ...state,
  });

export const restorePlayer = (state: PlayerState): PlayerState => ({
  body: {
    pos: [...state.body.pos],
    vel: [...state.body.vel],
    halfWidth: state.body.halfWidth,
    height: state.body.height,
    onGround: state.body.onGround,
  },
  yaw: state.yaw,
  pitch: state.pitch,
  walk: state.walk,
  stance: state.stance,
  sprinting: state.sprinting,
  firearmReadyWalking: state.firearmReadyWalking,
  handlingPausedForKnockout: state.handlingPausedForKnockout,
  ladder: state.ladder && { ...state.ladder },
});

export interface MoveIntent {
  forward: number; // -1..1
  right: number; // -1..1
  jump: boolean;
  sprint: boolean;
  /** Walk instead of jog. Sprinting wins over walking. */
  walk: boolean;
  /** A lowered stance's pace from the loaded base/mod content; it overrides walking and sprinting pace. */
  stanceSpeed?: number | undefined;
  /** Directional pace factors from the loaded base/mod content. */
  directionalSpeed?: { sideways: number; backward: number } | undefined;
  /** Edge-triggered dominant-hand use; the player tick consumes this once. */
  useDominant?: boolean;
  /** Held dominant trigger; only debug firearms repeat, not other item actions. */
  useDominantHeld?: boolean;
  /** Edge-triggered off-hand use; the player tick consumes this once. */
  useOff?: boolean;
  /** Speed factor from load and handling (paceFactor); 1 when absent. */
  pace?: number;
  /** On a ladder: not airborne, and `climb` reads the steered velocity. */
  onLadder?: boolean;
}

/** Grams: carrying more than `light` slows you, down to `slowest` at `heavy`. */
const LOAD = { light: 20_000, heavy: 40_000, slowest: 0.6 } as const;

/** Handling an item halves your pace (`DESIGN.md`, "Handling time"). */
const paceFactor = (grams: number, handling: boolean): number => {
  const over = Math.max(0, grams - LOAD.light) / (LOAD.heavy - LOAD.light);
  const load = Math.max(LOAD.slowest, 1 - (1 - LOAD.slowest) * over);
  return handling ? load * 0.5 : load;
};

export const movementPace = (
  intent: MoveIntent,
  {
    grams,
    handling,
    readyMovementFactor,
    movementSpeed,
    stanceSpeed,
    directionalSpeed,
  }: {
    grams: number;
    handling: boolean;
    readyMovementFactor: number;
    movementSpeed: number;
    stanceSpeed: number | undefined;
    directionalSpeed: { sideways: number; backward: number };
  },
): MoveIntent => ({
  ...intent,
  stanceSpeed,
  directionalSpeed,
  pace: paceFactor(grams, handling) * movementSpeed * readyMovementFactor,
});

/**
 * Sets the body's horizontal velocity from the intent and view yaw; starts a jump if grounded. An airborne body keeps
 * the velocity it left the ground with (`DESIGN.md`, "Moving in the air"); a ladder climber is not airborne.
 */
export const steer = (body: Body, scale: Scale, yaw: number, intent: MoveIntent): void => {
  if (!(body.onGround || intent.onLadder)) {
    return;
  }
  let { forward, right } = intent;
  const len = Math.hypot(forward, right);
  const direction = intent.directionalSpeed;
  const forwardFactor = forward < 0 ? (direction?.backward ?? 1) : 1;
  const sidewaysFactor = direction?.sideways ?? 1;
  const axisWeight = Math.abs(forward) + Math.abs(right);
  const directionFactor =
    axisWeight === 0 ? 1 : (Math.abs(forward) * forwardFactor + Math.abs(right) * sidewaysFactor) / axisWeight;
  if (len > 1) {
    forward /= len;
    right /= len;
  }
  let pace: number = PLAYER.jog;
  if (intent.walk) {
    pace = PLAYER.walk;
  }
  if (intent.stanceSpeed !== undefined) {
    pace = intent.stanceSpeed;
  } else if (intent.sprint) {
    pace = PLAYER.sprint;
  }
  const speed = (pace * (intent.pace ?? 1) * directionFactor) / scale.blockSize;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // yaw 0 looks down -z; +x is to the right.
  body.vel[0] = (-sin * forward + cos * right) * speed;
  body.vel[2] = (-cos * forward - sin * right) * speed;
  if (intent.jump && body.onGround) {
    body.vel[1] = PLAYER.jump / scale.blockSize;
  }
};
