import { expect, it } from 'vitest';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import { BlockEntities } from '../src/core/blockEntities.ts';
import { worldOpaque, worldSolid } from '../src/core/collision.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { raycast } from '../src/core/raycast.ts';
import { sitePalette, terrainShapeOf } from '../src/core/sitePalette.ts';
import { World } from '../src/core/world.ts';
import { generateChunk } from '../src/core/worldgen.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { content as BUNDLED_CONTENT, configFromUrl } from './fixtures/startupContent.ts';

const practiceWorld = () => {
  const config = configFromUrl(new URLSearchParams('site=tutorial'));
  const { registry } = BUNDLED_CONTENT;
  const layout = registry.layouts.get(config.site)!;
  const site = new AuthoredSite(config.seed, registry, config.scale, layout);
  const world = new World();
  const entities = new BlockEntities(registry);
  const terrain = {
    seed: config.seed,
    shape: terrainShapeOf(registry),
    scale: config.scale,
    surface: site.surface,
    blocks: sitePalette(registry).terrain,
    stamp: (chunk: Parameters<AuthoredSite['stamp']>[0]) => site.stamp(chunk),
  };
  const s = config.scale.blockSize;
  const columns: [number, number][] = [];
  for (let cx = Math.floor(layout.bounds.x0 / (32 * s)); cx <= Math.floor(layout.bounds.x1 / (32 * s)); cx++) {
    for (let cz = Math.floor(layout.bounds.z0 / (32 * s)); cz <= Math.floor(layout.bounds.z1 / (32 * s)); cz++) {
      columns.push([cx, cz]);
      for (const cy of [-1, 0, 1]) {
        const chunk = generateChunk(terrain, [cx, cy, cz]);
        site.stamp(chunk);
        world.addChunk(chunk);
      }
    }
  }
  return { config, registry, layout, site, world, entities, columns, s };
};

it('the static firing line has a solid backstop between every firing position and the essentials threat', () => {
  const { site, world, registry, entities, s, layout } = practiceWorld();
  const line = site.playtestMarks.beats.find((beat) => beat.id === 'tutorial_firing_line')!.area;
  const solid = worldSolid(world, registry, entities);
  expect(layout.shamblers.length).toBeGreaterThan(0);
  expect(line.x1).toBeGreaterThan(line.x0);
  expect(line.z1).toBeGreaterThan(line.z0);
  for (let x = line.x0; x < line.x1; x += 1) {
    for (let z = line.z0; z < line.z1; z += 1) {
      const origin: Vec3 = [x, 4, z];
      expect(solid(...origin)).toBe(false);
      for (const threat of layout.shamblers) {
        const target = threat.position.map((v, axis) => v / s + (axis === 1 ? 2 : 0)) as Vec3;
        const delta = target.map((v, axis) => v - origin[axis]!) as Vec3;
        const distance = Math.hypot(...delta);
        expect(
          raycast(origin, delta.map((v) => v / distance) as Vec3, distance, solid),
          JSON.stringify({ origin, target }),
        ).toBeDefined();
      }
      expect(raycast(origin, [0, 0, -1], (layout.bounds.z1 - layout.bounds.z0) / s, solid)).toBeDefined();
    }
  }
});

it('the authored essentials and optional range paths can be walked with the ordinary threat active and no injury', () => {
  const { config, registry, layout, site, world, entities, columns, s } = practiceWorld();
  let { yaw } = site.spawn;
  let moving = false;
  const session = createSession({
    registry,
    world,
    entities,
    scale: config.scale,
    seed: config.seed,
    start: config.start,
    spawn: site.spawn.pos.map((v) => v / s) as Vec3,
    isSolid: worldSolid(world, registry, entities),
    isOpaque: worldOpaque(world, registry, entities),
    ready: () => true,
    controls: {
      active: () => true,
      intent: () => ({ ...IDLE, forward: Number(moving), walk: true }),
      yaw: () => yaw,
      pitch: () => 0,
      walking: () => true,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
  });
  for (const [cx, cz] of columns) {
    session.onColumn(cx, cz, site);
  }
  expect(session.zombieStore.size).toBeGreaterThan(0);
  session.sim.paused = false;
  const { health } = session.sim.body;
  const walkPath = (path: readonly [number, number][]) => {
    expect(path.length).toBeGreaterThan(0);
    for (const [xm, zm] of path) {
      const target = [xm / s, zm / s];
      moving = true;
      let arrived = false;
      for (let tick = 0; tick < 3600; tick++) {
        const dx = target[0]! - session.body.pos[0];
        const dz = target[1]! - session.body.pos[2];
        if (Math.hypot(dx, dz) < 1) {
          arrived = true;
          break;
        }
        yaw = Math.atan2(-dx, -dz);
        session.frame(1 / 60);
        expect(session.sim.body.health).toBe(health);
        expect(session.sim.dead).toBeUndefined();
      }
      expect(
        arrived,
        `the path must reach each corner: ${JSON.stringify({ target, position: session.body.pos })}`,
      ).toBe(true);
    }
  };
  walkPath(layout.tracks[0]!.points.slice(1));
  const exit = site.playtestMarks.beats.find((beat) => beat.id === 'tutorial_exit')!;
  expect(session.body.pos[0]).toBeGreaterThanOrEqual(exit.area.x0);
  expect(session.body.pos[0]).toBeLessThan(exit.area.x1);
  expect(session.body.pos[2]).toBeGreaterThanOrEqual(exit.area.z0);
  expect(session.body.pos[2]).toBeLessThan(exit.area.z1);
  for (const track of layout.tracks.slice(1)) {
    walkPath(track.points);
  }
});
