import type * as Rapier from '../../../vendor/rapier-f64/rapier.js';
import config from '../../config/vehicleFeasibility.json' with { type: 'json' };

export const { driving } = config;
type RapierApi = Pick<typeof Rapier, 'World' | 'RigidBodyDesc' | 'ColliderDesc'>;
export type Scenario = (typeof driving.scenarios)[number];
export type Box = Scenario['boxes'][number];
export type Vector = [number, number, number];
export interface Sample {
  position: Vector;
  velocity: Vector;
  penetration: number;
  outsideEnvelope: boolean;
}
export interface Driver {
  step: (throttle: number) => Sample;
  dispose: () => void;
}
const vector = (a: number[]): Vector => [a[0]!, a[1]!, a[2]!];
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vector, b: Vector, scale = 1): Vector => [
  a[0] + b[0] * scale,
  a[1] + b[1] * scale,
  a[2] + b[2] * scale,
];
function axes(box: Box): Vector[] {
  const [x, y, z, w] = box.rotation as [number, number, number, number];
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)],
    [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)],
    [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)],
  ];
}
export function penetration(position: Vector, box: Box): number {
  const relative = add(position, vector(box.centre), -1);
  const local = axes(box).map((axis) => dot(relative, axis));
  const distances = local.map((value, axis) => Math.max(0, Math.abs(value) - box.half[axis]!));
  const square = distances.reduce((sum, value) => sum + value * value, 0);
  if (square === 0) {
    return driving.radius + Math.min(...local.map((value, axis) => box.half[axis]! - Math.abs(value)));
  }
  return Math.max(0, driving.radius - Math.sqrt(square));
}
function admit(scenario: Scenario) {
  if (scenario.boxes.length === 0 || scenario.boxes.length > driving.maxColliders) {
    throw new Error('Collision admission exceeded');
  }
  for (const box of scenario.boxes) {
    if (
      box.half.length !== 3 ||
      box.centre.length !== 3 ||
      box.rotation.length !== 4 ||
      box.half.some((value) => !Number.isFinite(value) || value <= 0) ||
      [...box.centre, ...box.rotation].some((value) => !Number.isFinite(value))
    ) {
      throw new Error('Invalid collider geometry');
    }
    if (Math.abs(box.rotation.reduce((sum, value) => sum + value * value, 0) - 1) > Number.EPSILON * 4) {
      throw new Error('Non-unit collider rotation');
    }
  }
  if (
    scenario.position.length !== 3 ||
    scenario.velocity.length !== 3 ||
    [...scenario.position, ...scenario.velocity].some((value) => !Number.isFinite(value))
  ) {
    throw new Error('Non-finite initial state');
  }
  if (scenario.boxes.some((box) => penetration(vector(scenario.position), box) > driving.penetrationLimit)) {
    throw new Error('Initially penetrating collider');
  }
}
export function rapierDriver(api: RapierApi, scenario: Scenario): Driver {
  admit(scenario);
  const world = new api.World({ x: driving.gravity[0]!, y: driving.gravity[1]!, z: driving.gravity[2]! });
  world.timestep = 1 / driving.tickHz;
  world.integrationParameters.numSolverIterations = driving.solverIterations;
  world.integrationParameters.numInternalPgsIterations = driving.internalIterations;
  world.integrationParameters.maxCcdSubsteps = driving.ccdSubsteps;
  const body = world.createRigidBody(
    api.RigidBodyDesc.dynamic()
      .setTranslation(...vector(scenario.position))
      .setLinvel(...vector(scenario.velocity))
      .lockRotations()
      .setCcdEnabled(true)
      .setCanSleep(false),
  );
  world.createCollider(
    api.ColliderDesc.ball(driving.radius)
      .setMass(driving.massKg)
      .setFriction(driving.friction)
      .setRestitution(driving.restitution),
    body,
  );
  for (const box of scenario.boxes) {
    const [x, y, z, w] = box.rotation as [number, number, number, number];
    world.createCollider(
      api.ColliderDesc.cuboid(...vector(box.half))
        .setTranslation(...vector(box.centre))
        .setRotation({ x, y, z, w })
        .setFriction(driving.friction)
        .setRestitution(driving.restitution),
    );
  }
  return {
    step(throttle) {
      const before = body.linvel();
      body.setLinvel(
        { ...before, x: before.x + (Math.max(-1, Math.min(1, throttle)) * driving.driveAcceleration) / driving.tickHz },
        true,
      );
      world.step();
      const { x, y, z } = body.translation();
      const { x: vx, y: vy, z: vz } = body.linvel();
      const position: Vector = [x, y, z];
      return {
        position,
        velocity: [vx, vy, vz],
        penetration: Math.max(...scenario.boxes.map((box) => penetration(position, box))),
        outsideEnvelope: y < driving.lowerEnvelope,
      };
    },
    dispose() {
      world.free();
    },
  };
}
export function traceBits(value: unknown): string {
  const view = new DataView(new ArrayBuffer(8));
  return JSON.stringify(value, (_key, field: unknown) => {
    if (typeof field !== 'number') {
      return field;
    }
    view.setFloat64(0, field, false);
    return view.getBigUint64(0, false).toString(16).padStart(16, '0');
  });
}
export function runDriving(api: RapierApi) {
  return Object.fromEntries(
    driving.scenarios.map((scenario) => {
      const driver = rapierDriver(api, scenario);
      try {
        const trajectory = Array.from({ length: driving.ticks }, () => driver.step(0));
        return [
          scenario.id,
          {
            trajectory,
            properties: {
              terminal: trajectory.at(-1)!,
              maximumPenetration: Math.max(...trajectory.map((tick) => tick.penetration)),
              minimumY: Math.min(...trajectory.map((tick) => tick.position[1])),
              maximumX: Math.max(...trajectory.map((tick) => tick.position[0])),
              maximumZ: Math.max(...trajectory.map((tick) => tick.position[2])),
              outsideEnvelope: trajectory.some((tick) => tick.outsideEnvelope),
              internalWork: 'unmeasured',
            },
          },
        ];
      } finally {
        driver.dispose();
      }
    }),
  );
}
