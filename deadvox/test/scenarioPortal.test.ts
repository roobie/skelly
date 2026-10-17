import { describe, expect, it } from 'vitest';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { buildCityPlan, cityGridOf, servicePlacement } from '../src/core/cityPlan.ts';
import { CitySite } from '../src/core/citySite.ts';
import { worldSolid } from '../src/core/collision.ts';
import { buildRegistry } from '../src/core/content.ts';
import { CHUNK, toChunk, type Vec3 } from '../src/core/coords.ts';
import { doorPlan } from '../src/core/options.ts';
import { makeScale } from '../src/core/scale.ts';
import { terrainShapeOf } from '../src/core/sitePalette.ts';
import {
  compileTemplate,
  type Facing,
  type Placement,
  placedPieces,
  placedPoint,
  type stampPlacement,
} from '../src/core/templates.ts';
import { World } from '../src/core/world.ts';
import { generateColumn } from '../src/core/worldgen.ts';
import { startupContent } from './baseRegistry.ts';

const BUNDLED_CONTENT = startupContent();

import { DOOR_ACTION } from '../src/game/doorAction.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { fixtureScenario, fixtureScenarioSources } from './fixtures/scenario.ts';

const yawOutward: Record<Facing, number> = { n: 0, e: -Math.PI / 2, s: Math.PI, w: Math.PI / 2 };
const profile = fixtureScenario();
const own = buildRegistry(fixtureScenarioSources(profile));
if (own.issues.length > 0) {
  throw new Error(JSON.stringify(own.issues));
}
const registry = {
  ...BUNDLED_CONTENT.registry,
  blocks: [...BUNDLED_CONTENT.registry.blocks],
  blockIds: new Map(BUNDLED_CONTENT.registry.blockIds),
  templates: new Map([...BUNDLED_CONTENT.registry.templates, ...own.registry.templates]),
  furniture: new Map([...BUNDLED_CONTENT.registry.furniture, ...own.registry.furniture]),
  mapPools: new Map([...BUNDLED_CONTENT.registry.mapPools, ...own.registry.mapPools]),
  body: new Map([...BUNDLED_CONTENT.registry.body, ...own.registry.body]),
  compression: new Map([...BUNDLED_CONTENT.registry.compression, ...own.registry.compression]),
};
registry.blockIds.set('fixture_solid', registry.blocks.length);
registry.blocks.push(own.registry.blocks[own.registry.blockIds.get('fixture_solid')!]!);
const template = compileTemplate(registry, own.registry.templates.get(profile.serviceTemplate)!);
const scale = makeScale(0.5);
const floor = CHUNK;

describe('owned hatch/ladder portal fixtures', () => {
  it.each([0, 1, 2, 3] as const)('descends and returns through a rotated chunk-seam portal, turn %s', (turn) => {
    const grid = { ...cityGridOf(registry, profile.city), street: CHUNK - profile.city.pad - 2 };
    const basePlan = buildCityPlan({ seed: 73, registry, floor, grid, scenario: profile });
    const placement: Placement = servicePlacement({ template, floor, grid, cell: turn < 2 ? [0, -1] : [-1, 0], turn });
    const site = new CitySite(73, registry, scale, { ...basePlan, placements: [placement], service: placement });
    const upper = placedPoint(placement, profile.portal.upper);
    const lower = placedPoint(placement, profile.portal.lower);
    const pieces = placedPieces(placement);
    const entities = new BlockEntities(registry);
    for (const piece of pieces) {
      entities.add({ type: piece.furniture, pos: piece.pos, size: piece.size, facing: piece.facing });
    }
    const hatch = [...entities.all].find((entity) => entities.defOf(entity).door?.hatch)!;
    const ladders = [...entities.all].filter((entity) => entities.defOf(entity).climbable);
    expect(ladders.length).toBeGreaterThan(0);
    const top = ladders.reduce((a, b) => (a.pos[1] > b.pos[1] ? a : b));
    const bottom = ladders.reduce((a, b) => (a.pos[1] < b.pos[1] ? a : b));
    const world = new World();
    const solidId = registry.blockIds.get('fixture_solid')!;
    const terrain = {
      seed: 73,
      shape: terrainShapeOf(registry),
      scale,
      blocks: { grass: solidId, dirt: solidId, rock: solidId, sand: solidId },
      surface: { height: () => floor, top: () => solidId },
      stamp: (chunk: Parameters<typeof stampPlacement>[0]) => site.stamp(chunk),
    };
    for (let cz = toChunk(placement.origin[2] - 2); cz <= toChunk(placement.origin[2] + template.size[2] + 2); cz++) {
      for (let cx = toChunk(placement.origin[0] - 2); cx <= toChunk(placement.origin[0] + template.size[0] + 2); cx++) {
        for (const chunk of generateColumn(terrain, cx, cz)) {
          world.addChunk(chunk);
        }
      }
    }
    let intent = { ...IDLE };
    let yaw = yawOutward[top.facing];
    const isSolid = worldSolid(world, registry, entities);
    const session = createSession({
      registry,
      scenario: profile,
      world,
      entities,
      scale,
      isSolid,
      isOpaque: isSolid,
      seed: 73,
      start: 43_200,
      spawn: [...upper],
      ready: () => true,
      controls: {
        active: () => true,
        intent: () => intent,
        yaw: () => yaw,
        pitch: () => 0,
        walking: () => intent.walk,
        descending: () => false,
      },
      audio: { play: () => undefined },
      notice: () => undefined,
      onRead: () => undefined,
    });
    const speed = registry.furniture.get(top.type)!.climbable!.speedMetresPerSimSecond;
    const frames = Math.ceil(
      (((Math.abs(upper[1] - lower[1]) + Math.hypot(upper[0] - lower[0], upper[2] - lower[2])) * scale.blockSize) /
        speed +
        3) *
        60,
    );
    const advanceUntil = (predicate: () => boolean) => {
      for (let frame = 0; frame < frames && !predicate(); frame++) {
        session.frame(1 / 60);
      }
      expect(
        predicate(),
        JSON.stringify({
          pos: session.body.pos,
          ground: session.body.onGround,
          hold: session.ladderHold.snapshotState(),
        }),
      ).toBe(true);
    };
    advanceUntil(() => session.body.onGround);
    const plan = doorPlan(session.inventory, hatch, 'open');
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      throw new Error(plan.reason);
    }
    session.queue.enqueueAction(DOOR_ACTION, 'open fixture hatch', plan.time, { entityUid: hatch.uid });
    advanceUntil(() => hatch.open);
    expect(session.grabLadder(top)).toBeUndefined();
    intent = { ...IDLE, forward: 1, walk: true };
    advanceUntil(() => session.body.onGround && session.body.pos[1] < hatch.pos[1]);
    const target: Vec3 = [...lower];
    yaw = Math.atan2(-(target[0] - session.body.pos[0]), -(target[2] - session.body.pos[2]));
    advanceUntil(() => Math.hypot(target[0] - session.body.pos[0], target[2] - session.body.pos[2]) < 0.1);
    expect(session.grabLadder(bottom)).toBeUndefined();
    yaw = yawOutward[top.facing] + Math.PI;
    advanceUntil(() => session.body.onGround && session.body.pos[1] >= upper[1] - 0.01);
    expect(session.sim.body.health).toBeGreaterThan(0);
  });
});
