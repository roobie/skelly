import { expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { buildRegistry } from '../src/core/content.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { CONTACT_SKIN } from '../src/core/physics.ts';
import { makeScale } from '../src/core/scale.ts';
import type { ScenarioDiscovery } from '../src/core/scenarioDiscovery.ts';
import { World } from '../src/core/world.ts';
import { startupContent } from './baseRegistry.ts';

const BUNDLED_CONTENT = startupContent();

import { type MoveIntent, PLAYER } from '../src/game/player.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { fixtureScenario, fixtureScenarioSources } from './fixtures/scenario.ts';

const profile = fixtureScenario();
const own = buildRegistry(fixtureScenarioSources(profile));
if (own.issues.length > 0) {
  throw new Error(JSON.stringify(own.issues));
}
const registry = {
  ...BUNDLED_CONTENT.registry,
  furniture: new Map([...BUNDLED_CONTENT.registry.furniture, ...own.registry.furniture]),
  body: new Map([...BUNDLED_CONTENT.registry.body, ...own.registry.body]),
  compression: new Map([...BUNDLED_CONTENT.registry.compression, ...own.registry.compression]),
};

const startSession = ({
  discovery,
  entities,
  solid,
  spawn,
  intent,
}: {
  discovery: ScenarioDiscovery;
  entities: BlockEntities;
  solid: (x: number, y: number, z: number) => boolean;
  spawn: Vec3;
  intent: () => MoveIntent;
}) =>
  createSession({
    registry,
    scenario: profile,
    discovery,
    world: new World(),
    entities,
    scale: makeScale(0.5),
    isSolid: solid,
    isOpaque: solid,
    seed: 73,
    start: 43_200,
    spawn,
    ready: () => true,
    controls: {
      active: () => true,
      intent,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => true,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
  });

it.each(['stationary', 'ceiling-blocked'] as const)(
  'records entrance travel only after accepted displacement, not a %s ladder hold',
  (hold) => {
    const scale = makeScale(0.5);
    const ceiling = 8;
    const entities = new BlockEntities(registry);
    const ladder = entities.add({ type: 'fixture_ladder', pos: [0, 1, 0], size: [2, 10, 1], facing: 'n' });
    let intent = { ...IDLE, forward: hold === 'ceiling-blocked' ? -1 : 0, walk: true };
    const solid = (_x: number, y: number, _z: number) => y === 0 || (hold === 'ceiling-blocked' && y === ceiling);
    const box = { min: [0, 1, 0] as const, max: [2, 12, 1] as const };
    const session = startSession({
      discovery: { clues: [], landmarks: [], building: box, entrance: box, ports: [] },
      entities,
      solid,
      spawn: [1, hold === 'ceiling-blocked' ? ceiling - PLAYER.height / scale.blockSize : 3, 0.5],
      intent: () => intent,
    });
    expect(ladder).toBeDefined();
    expect(session.grabLadder(ladder!)).toBeUndefined();
    const advance = () => session.frame(1 / 60);
    const before = [...session.body.pos];
    for (let frame = 0; frame < 6; frame++) {
      advance();
    }
    expect(session.ladderHold.on).toBe(true);
    expect(Math.hypot(...session.body.pos.map((value, axis) => value - before[axis]!))).toBeLessThanOrEqual(
      2 * CONTACT_SKIN,
    );
    expect(session.scenarioRun!.discovery.entranceTravel).toBeNull();

    intent = { ...IDLE, forward: 1, walk: true };
    advance();
    expect(session.body.pos[1]).toBeLessThan(before[1]! - 2 * CONTACT_SKIN);
    const first = session.scenarioRun!.discovery.entranceTravel;
    expect(first).not.toBeNull();
    advance();
    expect(session.scenarioRun!.discovery.entranceTravel).toBe(first);
  },
);

it('records sewer travel, not entrance travel, when the player walks through an underground port', () => {
  const hatch = { min: [20, 1, 20] as const, max: [22, 12, 21] as const };
  const port = { min: [0, 0, -1] as const, max: [2, 5, 0] as const };
  const session = startSession({
    discovery: { clues: [], landmarks: [], building: hatch, entrance: hatch, ports: [port] },
    entities: new BlockEntities(registry),
    solid: (_x, y) => y === 0,
    spawn: [1, 1, 4],
    intent: () => ({ ...IDLE, forward: 1, walk: true }),
  });
  session.frame(1 / 60);
  expect(session.scenarioRun!.discovery.sewerTravel).toBeNull();
  for (let frame = 0; frame < 600 && session.body.pos[2] > port.min[2]; frame++) {
    session.frame(1 / 60);
  }
  expect(session.body.pos[2]).toBeLessThanOrEqual(port.min[2]);
  expect(session.scenarioRun!.discovery.sewerTravel).not.toBeNull();
  expect(session.scenarioRun!.discovery.entranceTravel).toBeNull();
});
