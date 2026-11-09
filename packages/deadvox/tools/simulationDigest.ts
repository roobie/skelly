// biome-ignore-all lint/correctness/noNodejsModules: This command-line tool runs in Node.js.
// Prints digests of a fixed actor simulation, so a refactor round can show that moving code did not
// change what the simulation does. It pins no values; `docs/simulation-digest.md` says when to compare.
import { createHash } from 'node:crypto';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import type { PlayerSense } from '../src/core/actorSense.ts';
import { ActorSystem } from '../src/core/actorSystem.ts';
import { claimed } from '../src/core/capabilities.ts';
import { buildRegistry, requireDayCycle } from '../src/core/content.ts';
import { dayPhaseAt } from '../src/core/dayPhase.ts';
import { admitPacks } from '../src/core/packAdmission.ts';
import { makeScale } from '../src/core/scale.ts';
import { siteGenerationOf } from '../src/core/sitePalette.ts';
import { physicsFor, playerTuning } from '../src/game/player.ts';
import { readBundledPacks, readStackActorFigureFiles } from './readBundledPacks.ts';

const SEED = 1539;
const TICKS = 2000;
const STACK = 'skelly.deadvox';

// The flattened digest hashes these fields, read from the actor or else from its agent, in this
// order. The order is part of the digest's definition, so a baseline stays comparable across rounds
// that only move code.
const FLATTENED_FIELDS = [
  'type',
  'hordeId',
  'hordeOffset',
  'body',
  'facing',
  'home',
  'mode',
  'investigationTier',
  'behaviorRng',
  'soundRng',
  'dismemberRng',
  'spitRng',
  'idleSoundTimer',
  'lastVocalNoiseId',
  'modeTimer',
  'hesitationFrom',
  'refusedAt',
  'leanTarget',
  'searchAnchor',
  'searchTimer',
  'searchStrolling',
  'searchHeading',
  'strollHeading',
  'horizontalSpeed',
  'obstacleWanderHeading',
  'obstacleWanderRemaining',
  'obstacleContact',
  'obstacleSlideSide',
  'bodyLookTarget',
  'headYaw',
  'headYawTarget',
  'lookTimer',
  'swayValue',
  'swayStart',
  'swayTarget',
  'swayElapsed',
  'swayDuration',
  'lurchValue',
  'lurchStart',
  'lurchTarget',
  'lurchElapsed',
  'lurchDuration',
  'stumbleFactor',
  'stumbleElapsed',
  'stumbleDuration',
  'regions',
  'figureSeed',
  'incapacitated',
  'lastPerceived',
  'stimulusAt',
  'lastAlertAt',
  'attackWait',
  'attackWindup',
  'spitWindup',
  'staggerSimSeconds',
  'spitWait',
  'gaitPhase',
  'footstepClock',
  'wanderClock',
  'stanceWeight',
  'stepOffset',
  'hitFlinchTime',
  'severed',
  'carved',
];

type Fields = Record<string, unknown>;

const flattened = (actor: Fields): Fields => {
  const agent = (actor.agent ?? {}) as Fields;
  return Object.fromEntries(
    FLATTENED_FIELDS.filter((key) => key in actor || key in agent).map((key) => [
      key,
      key in actor ? actor[key] : agent[key],
    ]),
  );
};

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const admitted = admitPacks(readBundledPacks(packageRoot, STACK));
if (admitted.issues.length > 0) {
  throw new Error(JSON.stringify(admitted.issues));
}
const { registry, issues } = buildRegistry(admitted.sources);
if (issues.length > 0) {
  throw new Error(JSON.stringify(issues));
}
const actorFigureFiles = readStackActorFigureFiles(packageRoot, STACK, registry);

const player: PlayerSense = {
  pos: [8, 1, 0],
  facing: [-1, 0, 0],
  movement: 'jogging',
  lit: false,
  lightSeenFrom: 40,
  eyeHeightMetres: 1.3,
  stance: 'standing',
};
// A floor with one wall, so actors lose and regain sight of the player.
const solid = (x: number, y: number, z: number): boolean =>
  y === 0 || (x === 4 && z >= -3 && z <= 3 && y >= 1 && y <= 4);
const system = new ActorSystem({
  seed: SEED,
  activeActorRadiusMetres: siteGenerationOf(registry).activeActorRadiusMetres,
  actorFigureFiles,
  isSolid: solid,
  isOpaque: solid,
  blockSize: 0.5,
  physics: physicsFor(makeScale(0.5), playerTuning(registry)),
  tuning: claimed(registry.senses, 'player'),
  player: () => player,
  dayPhase: () => dayPhaseAt(requireDayCycle(registry), 12 * 3600),
  hurtPlayer: () => undefined,
});
const actorDef = (id: string) => {
  const def = registry.actors.get(id);
  if (!def) {
    throw new Error(`The ${STACK} stack defines no actor ${id}`);
  }
  return def;
};
system.add(actorDef('shambler'), [0, 1, 0], [1, 0, 0]);
system.add(actorDef('runner'), [10, 1, 3], [1, 0, 0]);
system.add(actorDef('shambler'), [-5, 1, -5], [1, 0, 0]);

// The player stands still out of sight, leaves, and returns, so the run passes through
// investigate, chase and search.
const playerMoves: ReadonlyMap<number, Pick<PlayerSense, 'pos' | 'movement'>> = new Map([
  [400, { pos: [0, 1, 8], movement: 'still' }],
  [900, { pos: [80, 1, 80], movement: 'still' }],
  [1500, { pos: [3, 1, -5], movement: 'jogging' }],
]);

const flat = createHash('sha256');
const raw = createHash('sha256');
const modes = new Set<string>();
for (let tick = 0; tick < TICKS; tick++) {
  const move = playerMoves.get(tick);
  if (move) {
    player.pos = move.pos;
    player.movement = move.movement;
  }
  system.tick(1 / 60, tick / 60);
  const state = system.snapshotState();
  for (const { actor } of state.actors) {
    const { mode } = (actor as unknown as { agent: { mode: string } }).agent;
    modes.add(mode);
    if (actor.chaseStance !== (mode === 'chase')) {
      throw new Error(`Body stance differs from the flattened decision input at tick ${tick}`);
    }
  }
  raw.update(JSON.stringify(state));
  flat.update(
    JSON.stringify({
      ...state,
      actors: state.actors.map(({ id, actor }) => ({ id, actor: flattened(actor as unknown as Fields) })),
    }),
  );
}

process.stdout.write(
  `${JSON.stringify({
    seed: SEED,
    ticks: TICKS,
    stack: STACK,
    modes: [...modes],
    flat: flat.digest('hex'),
    raw: raw.digest('hex'),
  })}\n`,
);
