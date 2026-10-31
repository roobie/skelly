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
  tests: number | null;
  impacts: number | null;
  saturated: boolean | null;
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
function sample(
  scenario: Scenario,
  position: Vector,
  velocity: Vector,
  work: Pick<Sample, 'tests' | 'impacts' | 'saturated'>,
): Sample {
  return {
    position: [...position],
    velocity: [...velocity],
    ...work,
    penetration: Math.max(...scenario.boxes.map((box) => penetration(position, box))),
    outsideEnvelope: position[1] < driving.lowerEnvelope,
  };
}

// Expanded box corners deliberately over-approximate the sphere: conservative, not a rounded-corner solver.
function sweep(position: Vector, displacement: Vector, box: Box) {
  const relative = add(position, vector(box.centre), -1);
  let enter = 0;
  let leave = 1;
  let normal: Vector | undefined;
  for (const [index, axis] of axes(box).entries()) {
    const origin = dot(relative, axis);
    const speed = dot(displacement, axis);
    const half = box.half[index]! + driving.radius;
    if (speed === 0) {
      if (Math.abs(origin) > half) {
        return;
      }
      continue;
    }
    const first = (-half - origin) / speed;
    const second = (half - origin) / speed;
    const near = Math.min(first, second);
    leave = Math.min(leave, Math.max(first, second));
    if (near >= enter) {
      enter = near;
      normal = axis.map((value) => value * (speed > 0 ? -1 : 1)) as Vector;
    }
    if (enter > leave) {
      return;
    }
  }
  return normal && enter >= 0 && enter <= 1 ? { fraction: enter, normal } : undefined;
}
function firstHit(position: Vector, displacement: Vector, boxes: Box[]) {
  let earliest: ReturnType<typeof sweep>;
  for (const box of boxes) {
    const hit = sweep(position, displacement, box);
    if (hit && (!earliest || hit.fraction < earliest.fraction)) {
      earliest = hit;
    }
  }
  return earliest;
}
export function ownedDriver(scenario: Scenario): Driver {
  admit(scenario);
  if (driving.friction !== 0) {
    throw new Error('Owned candidate supports frictionless contacts only');
  }
  const initial = vector(scenario.position);
  if (
    scenario.boxes.some((box) => {
      const relative = add(initial, vector(box.centre), -1);
      return axes(box).every((axis, index) => Math.abs(dot(relative, axis)) < box.half[index]! + driving.radius);
    })
  ) {
    throw new Error('Initially inside conservative collision envelope');
  }
  let position = initial;
  let velocity = vector(scenario.velocity);
  return {
    step(throttle) {
      velocity = add(velocity, vector(driving.gravity), 1 / driving.tickHz);
      velocity[0] += (Math.max(-1, Math.min(1, throttle)) * driving.driveAcceleration) / driving.tickHz;
      let remaining = 1 / driving.tickHz;
      let tests = 0;
      let impacts = 0;
      for (; impacts < driving.maxImpacts && remaining > 0; impacts += 1) {
        const displacement = velocity.map((value) => value * remaining) as Vector;
        tests += scenario.boxes.length;
        const earliest = firstHit(position, displacement, scenario.boxes);
        if (!earliest) {
          position = add(position, displacement);
          remaining = 0;
          break;
        }
        position = add(add(position, displacement, earliest.fraction), earliest.normal, driving.skin);
        const inward = dot(velocity, earliest.normal);
        if (inward < 0) {
          velocity = add(velocity, earliest.normal, -(1 + driving.restitution) * inward);
        }
        remaining *= 1 - earliest.fraction;
      }
      // A saturated tick discards remaining displacement, never an unchecked collision step.
      return sample(scenario, position, velocity, { tests, impacts, saturated: remaining > 0 });
    },
    dispose: () => undefined,
  };
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
      return sample(scenario, [x, y, z], [vx, vy, vz], { tests: null, impacts: null, saturated: null });
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
    driving.scenarios.map((scenario) => [
      scenario.id,
      Object.fromEntries(
        (
          [
            ['owned', () => ownedDriver(scenario)],
            ['rapier', () => rapierDriver(api, scenario)],
          ] as const
        ).map(([name, factory]) => {
          const driver = factory();
          try {
            const trajectory = Array.from({ length: driving.ticks }, () => driver.step(0));
            return [
              name,
              {
                trajectory,
                properties: {
                  terminal: trajectory.at(-1)!,
                  maximumPenetration: Math.max(...trajectory.map((tick) => tick.penetration)),
                  minimumY: Math.min(...trajectory.map((tick) => tick.position[1])),
                  maximumX: Math.max(...trajectory.map((tick) => tick.position[0])),
                  maximumZ: Math.max(...trajectory.map((tick) => tick.position[2])),
                  outsideEnvelope: trajectory.some((tick) => tick.outsideEnvelope),
                  saturatedTicks: name === 'owned' ? trajectory.filter((tick) => tick.saturated).length : null,
                  maximumTests: name === 'owned' ? Math.max(...trajectory.map((tick) => tick.tests!)) : null,
                },
              },
            ];
          } finally {
            driver.dispose();
          }
        }),
      ),
    ]),
  );
}
