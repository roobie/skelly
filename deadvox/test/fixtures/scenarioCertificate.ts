import assert from 'node:assert/strict';
import { BlockEntities } from '../../src/core/blockEntities.ts';
import type { CityPlan } from '../../src/core/cityPlan.ts';
import { CitySite } from '../../src/core/citySite.ts';
import { worldSolid } from '../../src/core/collision.ts';
import type { Registry } from '../../src/core/content.ts';
import { toChunk, type Vec3 } from '../../src/core/coords.ts';
import { ladderOutward } from '../../src/core/ladders.ts';
import { doorPlan } from '../../src/core/options.ts';
import type { Scale } from '../../src/core/scale.ts';
import { scenarioCertificate } from '../../src/core/scenarioCertificate.ts';
import type { ScenarioDef } from '../../src/core/schema.ts';
import { compileTemplate, placedPieces } from '../../src/core/templates.ts';
import { DOOR_ACTION } from '../../src/game/doorAction.ts';
import { createSession, IDLE } from '../../src/game/session.ts';
import { buildFixtureRegistry } from '../economyFixtures.ts';

export const cyclicSite = (registry: Registry, base: CityPlan, scale: Scale): CitySite => {
  const own = buildFixtureRegistry([
    {
      source: 'owned-cycle.json',
      data: {
        furniture: [
          { id: 'cycle_stock', name: 'Cycle stock', size: [1, 1, 1], color: '#aaaaaa', solid: false },
          {
            id: 'cycle_door',
            name: 'Cycle door',
            size: [1, 1, 1],
            color: '#aaaaaa',
            door: { handlingSimSeconds: 1 },
          },
        ],
        items: ['a', 'b'].map((id) => ({
          id: `cycle_key_${id}`,
          name: `Cycle key ${id}`,
          category: 'tool',
          weight: 10,
          size: [1, 1],
          key: { lock: `cycle_${id}` },
        })),
        templates: [
          { id: 'cycle_stock', size: [1, 1, 1], palette: { S: { furniture: 'cycle_stock' } }, layers: [['S']] },
          ...['a', 'b'].map((id) => ({
            id: `cycle_door_${id}`,
            size: [1, 1, 1],
            palette: { D: { furniture: 'cycle_door', lock: { id: `cycle_${id}`, locked: true } } },
            layers: [['D']],
          })),
        ],
      },
    },
  ]);
  assert(own.issues.length === 0, JSON.stringify(own.issues));
  const cycleRegistry = {
    ...registry,
    items: new Map([...registry.items, ...own.registry.items]),
    furniture: new Map([...registry.furniture, ...own.registry.furniture]),
  };
  const template = compileTemplate(cycleRegistry, own.registry.templates.get('cycle_stock')!);
  const stock = base.composition!.storeys.slice(0, 2).map((storey, index) => ({
    placement: {
      template,
      origin: [storey.standing[0] + 2, storey.standing[1], storey.standing[2]] as Vec3,
      turn: 0 as const,
    },
    fixedLoot: [
      {
        at: [0, 0, 0] as Vec3,
        items: [{ item: index === 0 ? 'cycle_key_b' : 'cycle_key_a', placement: 'surface' as const }],
      },
    ],
    standing: storey.standing,
  }));
  assert(stock[0] && stock[1]);
  const composition = {
    ...base.composition!,
    lootSources: stock,
    resources: stock.map(({ placement, standing }) => ({ at: placement.origin, standing })),
  };
  const plan = { ...base, composition, placements: [...base.placements, ...stock.map(({ placement }) => placement)] };
  class CyclicSite extends CitySite {
    override furnitureIn(cx: number, cz: number) {
      const sources = super
        .furnitureIn(cx, cz)
        .map((spawn) =>
          registry.furniture.get(spawn.spec.type)?.door?.hatch
            ? { ...spawn, spec: { ...spawn.spec, lock: { id: 'cycle_a', locked: true } } }
            : spawn,
        );
      const descents = plan.composition.descents.filter((link) => link.upper[1] === stock[0]!.standing[1]);
      assert(descents.length > 0);
      for (const descent of descents) {
        const hatchPos: Vec3 = [descent.ladder[0] - 1, descent.upper[1] - 1, descent.ladder[2]];
        if (toChunk(hatchPos[0]) === cx && toChunk(hatchPos[2]) === cz) {
          sources.push({
            spec: {
              type: 'roof_hatch',
              pos: hatchPos,
              size: [3, 1, 2],
              facing: 'w',
              lock: { id: 'cycle_b', locked: true },
            },
            loot: [],
          });
        }
      }
      return sources;
    }
  }
  return new CyclicSite(9, cycleRegistry, scale, plan);
};

export const traverseScenario = (site: CitySite, profile: ScenarioDef, scale: Scale): void => {
  const { plan, registry } = site;
  const certificate = scenarioCertificate(site);
  assert(certificate.issues.length === 0, JSON.stringify(certificate.issues));
  const { space } = certificate;
  const entities = new BlockEntities(registry);
  const solid = worldSolid(space.world, registry, entities);
  let intent = { ...IDLE };
  let yaw = 0;
  const session = createSession({
    registry,
    scenario: profile,
    world: space.world,
    entities,
    scale,
    isSolid: solid,
    isOpaque: solid,
    seed: site.seed,
    start: 43_200,
    spawn: [...plan.spawn],
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
  const loaded = new Set<string>();
  const load = () => {
    for (const chunk of space.world.chunks.values()) {
      const column = `${chunk.cx},${chunk.cz}`;
      if (!loaded.has(column)) {
        loaded.add(column);
        session.onColumn(chunk.cx, chunk.cz, site);
      }
    }
  };
  const until = (predicate: () => boolean, frames: number) => {
    for (let frame = 0; frame < frames && !predicate(); frame++) {
      session.frame(1 / 60);
    }
    assert(
      predicate(),
      JSON.stringify({
        pos: session.body.pos,
        ground: session.body.onGround,
        hold: session.ladderHold.snapshotState(),
      }),
    );
  };
  load();
  until(() => session.body.onGround, 60);
  const queuedDoors = new Set<number>();
  const openNearby = () => {
    for (const entity of entities.all) {
      const { door } = entities.defOf(entity);
      if (!door || door.hatch || entity.open || entity.lock?.locked || queuedDoors.has(entity.uid)) {
        continue;
      }
      if (!session.inventory.canReachEntity(entity)) {
        continue;
      }
      const opening = doorPlan(session.inventory, entity, 'open');
      if (opening.ok) {
        queuedDoors.add(entity.uid);
        session.queue.enqueueAction(DOOR_ACTION, 'open route door', opening.time, { entityUid: entity.uid });
      }
    }
  };
  const walk = (points: readonly Vec3[]) => {
    load();
    const simplified = points.filter((point, index) => {
      if (index === 0 || index === points.length - 1) {
        return true;
      }
      const a = points[index - 1]!;
      const b = points[index + 1]!;
      return (point[0] - a[0]) * (b[2] - point[2]) !== (point[2] - a[2]) * (b[0] - point[0]);
    });
    for (const target of simplified) {
      const distance = Math.hypot(target[0] - session.body.pos[0], target[2] - session.body.pos[2]);
      intent = { ...IDLE, forward: 1, walk: true };
      until(
        () => {
          openNearby();
          const dx = target[0] - session.body.pos[0];
          const dz = target[2] - session.body.pos[2];
          yaw = Math.atan2(-dx, -dz);
          return Math.hypot(dx, dz) < 0.04;
        },
        Math.ceil((distance / 2 + 2) * 60),
      );
      intent = { ...IDLE };
    }
  };
  const route = (from: Readonly<Vec3>, to: Readonly<Vec3>) => {
    const result = space.path(from, to);
    assert(result);
    return result!;
  };
  const corner: Vec3 = [
    plan.service!.origin[0] - plan.grid.pad - plan.grid.street / 2,
    plan.spawn[1],
    plan.service!.origin[2] - plan.grid.pad - plan.grid.street / 2,
  ];
  walk([[...plan.spawn], [corner[0], corner[1], plan.spawn[2]], corner]);
  walk(route(corner, plan.portal!.upper));
  const hatchIndex = plan.service!.template.pieces.findIndex((piece) =>
    piece.pos.every((value, axis) => value === profile.portal.hatch[axis]),
  );
  assert(hatchIndex >= 0);
  const hatch = entities.at(...placedPieces(plan.service!)[hatchIndex]!.pos)!;
  assert(!hatch.open);
  const opening = doorPlan(session.inventory, hatch, 'open');
  assert(opening.ok);
  session.queue.enqueueAction(DOOR_ACTION, 'open service hatch', opening.time, { entityUid: hatch.uid });
  until(() => hatch.open, Math.ceil((opening.time + 1) * 60));
  const connections = [
    { upper: plan.portal!.upper, lower: plan.portal!.lower, ladder: undefined as Readonly<Vec3> | undefined },
  ];
  const visited = new Set([plan.portal!.upper[1]]);
  let [, floor] = plan.portal!.lower;
  while (floor !== plan.composition!.objectiveFace[1]) {
    assert(!visited.has(floor));
    visited.add(floor);
    const next = plan.composition!.descents.find((descent) => descent.upper[1] === floor)!;
    assert(next);
    connections.push(next);
    [, floor] = next.lower;
  }
  const completed: typeof connections = [];
  let position: Readonly<Vec3> = plan.portal!.upper;
  for (const descent of connections) {
    const bottom = descent.ladder
      ? entities.at(...(descent.ladder as Vec3))!
      : [...entities.all].find(
          (entity) =>
            entities.defOf(entity).climbable &&
            entity.pos[1] === descent.lower[1] &&
            Math.hypot(entity.pos[0] - descent.lower[0], entity.pos[2] - descent.lower[2]) <= 3,
        )!;
    assert(bottom);
    const [ox, oz] = ladderOutward(bottom.facing);
    const approach: Vec3 = [
      bottom.pos[0] + bottom.size[0] / 2 - ox,
      descent.upper[1],
      bottom.pos[2] + bottom.size[2] / 2 - oz,
    ];
    walk(route(position, approach));
    const lid = [...entities.all].find(
      (entity) =>
        entities.defOf(entity).door?.hatch &&
        entity.pos[1] === descent.upper[1] - 1 &&
        bottom.pos[0] >= entity.pos[0] &&
        bottom.pos[0] < entity.pos[0] + entity.size[0] &&
        bottom.pos[2] >= entity.pos[2] &&
        bottom.pos[2] < entity.pos[2] + entity.size[2],
    );
    if (descent.ladder) {
      assert(!lid?.open);
      const centre: Vec3 = [bottom.pos[0] + bottom.size[0] / 2, descent.upper[1], bottom.pos[2] + bottom.size[2] / 2];
      const sides: Vec3[] = [
        [centre[0] + ox * 0.75, centre[1], centre[2] + oz * 0.75],
        [centre[0] - ox * 0.75, centre[1], centre[2] - oz * 0.75],
      ];
      for (const side of sides) {
        walk([side]);
        assert(session.body.onGround && Math.abs(session.body.pos[1] - descent.upper[1]) < 0.001);
      }
      walk([approach]);
    }
    assert(lid);
    if (!lid.open) {
      const lidOpening = doorPlan(session.inventory, lid, 'open');
      assert(lidOpening.ok);
      session.queue.enqueueAction(DOOR_ACTION, 'open descent hatch', lidOpening.time, { entityUid: lid.uid });
      until(() => lid.open, Math.ceil((lidOpening.time + 1) * 60));
    }
    const [top] = [...entities.all]
      .filter(
        (entity) =>
          entities.defOf(entity).climbable &&
          entity.pos[0] === bottom.pos[0] &&
          entity.pos[2] === bottom.pos[2] &&
          entity.pos[1] < descent.upper[1],
      )
      .sort((a, b) => b.pos[1] - a.pos[1]);
    assert(top);
    assert(session.grabLadder(top) === undefined);
    yaw = Math.atan2(-ox, -oz);
    intent = { ...IDLE, forward: 1, walk: true };
    const travel =
      ((descent.upper[1] - descent.lower[1]) * scale.blockSize) /
      entities.defOf(top).climbable!.speedMetresPerSimSecond;
    until(() => session.body.onGround && session.body.pos[1] < descent.lower[1] + 0.1, Math.ceil((travel + 3) * 60));
    intent = { ...IDLE };
    const centre: Vec3 = [bottom.pos[0] + bottom.size[0] / 2, descent.lower[1], bottom.pos[2] + bottom.size[2] / 2];
    walk(route(centre, descent.lower));
    position = descent.lower;
    completed.push({ ...descent, ladder: [...bottom.pos] });
  }
  walk(route(position, plan.composition!.objectiveFace));
  assert(Math.abs(session.body.pos[1] - plan.composition!.objectiveFace[1]) < 0.001);
  position = plan.composition!.objectiveFace;
  for (const ascent of completed.reverse()) {
    const bottom = entities.at(...(ascent.ladder as Vec3))!;
    const [ox, oz] = ladderOutward(bottom.facing);
    walk(route(position, ascent.lower));
    assert(session.grabLadder(bottom) === undefined);
    yaw = Math.atan2(ox, oz);
    intent = { ...IDLE, forward: 1, walk: true };
    const travel =
      ((ascent.upper[1] - ascent.lower[1]) * scale.blockSize) /
      entities.defOf(bottom).climbable!.speedMetresPerSimSecond;
    until(() => session.body.onGround && session.body.pos[1] > ascent.upper[1] - 0.1, Math.ceil((travel + 3) * 60));
    intent = { ...IDLE };
    const exit: Vec3 = [
      bottom.pos[0] + bottom.size[0] / 2 - ox,
      ascent.upper[1],
      bottom.pos[2] + bottom.size[2] / 2 - oz,
    ];
    walk(route(exit, ascent.upper));
    position = ascent.upper;
  }
  walk(route(position, plan.composition!.retreat));
  assert(session.body.onGround);
  assert(session.sim.body.health > 0);
};
