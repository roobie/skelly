// biome-ignore lint/correctness/noNodejsModules: this benchmark is intentionally Node-only.
import process from 'node:process';
import { angularVelocity, stepRigidBody } from '../src/core/rigidBody.ts';

const corners = [];
for (const x of [-0.08, 0.08]) {
  for (const y of [-0.08, 0.08]) {
    for (const z of [-0.08, 0.08]) {
      corners.push([x, y, z]);
    }
  }
}
const fast = process.argv.includes('--fast');
const bodies = Array.from({ length: 16 }, (_, index) => ({
  mass: 2,
  center: [index * 0.4, 10, 0],
  orientation: [0, 0, 0, 1],
  velocity: fast ? [60, 0.15, -0.35] : [0.75, 0.15, -0.35],
  angularMomentum: [0.001, 0.002, 0.001],
  inertiaBody: [
    [2, 0.1, 0],
    [0.1, 3, 0.2],
    [0, 0.2, 4],
  ],
  corners,
  elapsed: 0,
  quietTime: 0,
  asleep: false,
}));
const initial = bodies.map((body) => ({
  center: [...body.center],
  orientation: [...body.orientation],
  velocity: [...body.velocity],
  angularMomentum: [...body.angularMomentum],
}));
const reset = () => {
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    const state = initial[i];
    body.center = [...state.center];
    body.orientation = [...state.orientation];
    body.velocity = [...state.velocity];
    body.angularMomentum = [...state.angularMomentum];
    body.elapsed = 0;
    body.quietTime = 0;
    body.asleep = false;
  }
};
const world = { blockSize: 0.5, isSolid: (_x, y, _z) => y === -1 };
const stepFrame = () => {
  for (const body of bodies) {
    stepRigidBody(body, 1 / 60, world);
  }
};

for (let frame = 0; frame < 40; frame++) {
  stepFrame();
  reset();
}
const samples = [];
for (let frame = 0; frame < 200; frame++) {
  const start = performance.now();
  stepFrame();
  samples.push(performance.now() - start);
  reset();
}
samples.sort((a, b) => a - b);
const median = (samples[99] + samples[100]) / 2;
const [p95] = samples.slice(189, 190);
const [first] = bodies;
const radius = Math.max(...corners.map((corner) => Math.hypot(...corner)));
const speed = Math.hypot(...first.velocity) + radius * Math.hypot(...angularVelocity(first));
const needed = Math.ceil(((speed + 9.8 / 120) * (1 / 120)) / (0.5 * world.blockSize));
// biome-ignore lint/suspicious/noConsole: benchmark output is the reported measurement.
console.log(
  `16 airborne debris (${fast ? 'fast' : 'normal'}), 16.7 ms frame, 200 samples: median ${median.toFixed(3)} ms, p95 ${p95.toFixed(3)} ms; ${needed} inner parts of max 8`,
);
if (!(fast || median < 0.25)) {
  throw new Error('normal-case median exceeds the 0.25 ms bound');
}
