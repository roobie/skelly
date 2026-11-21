import { makeConfig } from '@skelly/engine/internal/game/config.ts';
import { decodeSave, encodeSave } from '@skelly/engine/save';
import { createSession, IDLE } from '@skelly/engine/session';
import { applyStartState } from '@skelly/engine/sim';
import { columnArrival, createWorldSetup, playerStartFromWorld } from '@skelly/engine/world';
import { ChunkMeshes } from '@skelly/presentation/render';
import { expect, it } from 'vitest';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { startupContent } from './baseRegistry.ts';
import { quietMesherSource } from './fixtures/quietMesherSource.ts';
import { formatVersion } from './snapshotTestSupport.ts';

const content = startupContent();
const scenario = content.registry.scenarios.get('holdout');
const start = content.registry.starts.get('holdout');
if (!(scenario?.kind === 'composedSite' && start)) {
  throw new Error('Holdout needs its composed scenario and start');
}

const recipe = content.registry.recipes.get('build_plank_wall');
if (!(recipe && 'block' in recipe.result)) {
  throw new Error('Holdout needs a wall recipe');
}
const wallBlock = recipe.result.block;
const wallKit = () => [
  ...recipe.components.map((options, index) => {
    const [component] = options;
    if (!(component && 'item' in component)) {
      throw new Error('Holdout wall recipe needs an item component option');
    }
    return { id: `wall-component-${index}`, item: component.item, count: component.count };
  }),
  ...Object.entries(recipe.qualities).map(([quality, level]) => {
    const tool = [...content.registry.items.values()].find((item) => (item.tool?.qualities[quality] ?? 0) >= level);
    if (!tool) {
      throw new Error(`Holdout wall recipe needs a ${quality} tool`);
    }
    return { id: `wall-tool-${quality}`, item: tool.id };
  }),
];
const config = { ...makeConfig(start.seed!, 32, content), startId: start.id, site: scenario.id };
const version = formatVersion;

const createHoldout = (restore?: Awaited<ReturnType<typeof decodeSave>>['snapshot']) => {
  const setup = createWorldSetup(
    config,
    new ChunkMeshes(config.scale.blockSize, content.registry),
    quietMesherSource(),
  );
  const pose = playerStartFromWorld(setup, config.scale, undefined, { restoring: restore !== undefined });
  const session = createSession({
    registry: content.registry,
    actorFigureFiles: stackActorFigureFiles(content.registry),
    scenario: setup.scenario,
    powerDevices: setup.powerDevices,
    skyFields: setup.skyFields,
    world: setup.simulationWorld,
    terrainDestruction: { terrain: setup.canonicalTerrain, source: setup },
    entities: setup.entities,
    isSolid: setup.isSolid,
    isOpaque: setup.isOpaque,
    isLightBlocking: setup.isLightBlocking,
    scale: config.scale,
    seed: config.seed,
    start: 0,
    spawn: pose.position,
    ready: () => true,
    controls: {
      active: () => true,
      intent: () => IDLE,
      yaw: () => pose.yaw,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
    ...(restore ? { restore } : {}),
  });
  const arrival = columnArrival(session, setup);
  setup.streamer.onColumn = arrival.load;
  for (let frame = 0; frame < 16; frame++) {
    setup.streamer.update(pose.position[0], pose.position[2]);
  }
  if (!restore) {
    const supplies = wallKit().map((entry) => ({
      ...entry,
      destination: { kind: 'pile' as const, pos: session.body.pos.map(Math.floor) as [number, number, number] },
    }));
    applyStartState(
      session.inventory,
      { ...start, kit: [...start.kit, ...supplies] },
      {
        fresh: true,
        calendar: session.sim.calendar,
        character: session.character,
        body: session.sim.body,
        damageCell: session.damageTerrainCell,
      },
    );
  }
  return { setup, session };
};

const snapshot = (session: ReturnType<typeof createSession>) =>
  session.snapshot({ worldId: 'holdout-world', characterId: 'holdout-character' });

it('keeps a placed Holdout wall, fired wave rule, and released horde across reload', async () => {
  const { setup, session } = createHoldout();
  const placed = (() => {
    let refusal: string | undefined;
    const [x, y, z] = session.body.pos.map(Math.floor) as [number, number, number];
    for (let dx = -8; dx <= 8; dx++) {
      for (let dz = -8; dz <= 8; dz++) {
        for (let dy = -8; dy <= 2; dy++) {
          const destination = { kind: 'cell' as const, pos: [x + dx, y + dy, z + dz] as [number, number, number] };
          refusal = session.crafting.place(recipe.id, destination);
          if (refusal === undefined) {
            return destination.pos;
          }
        }
      }
    }
    throw new Error(`Holdout player cannot place a wall: ${refusal}`);
  })();
  const work = session.inventory.hands.right;
  if (!work?.work) {
    throw new Error('Wall placement did not start work');
  }
  session.sim.scheduler.advance((work.work.duration - work.work.elapsed) / session.sim.clock.ratio + 1);
  expect(setup.simulationWorld.getBlock(...placed)).toBe(content.registry.blockIds.get(wallBlock));

  const rule = setup.scenario?.eventRules[0];
  if (!rule) {
    throw new Error('Holdout needs a first wave rule');
  }
  session.sim.setDebugCalendarTime(session.scenarioRun!.startedAtGameTimestamp + rule.trigger.afterGameHours);
  session.frame(1);
  const saved = snapshot(session);
  const firedAt = saved.character.scenarioRun!.eventsFiredAtGameTimestamp[rule.id];
  const hordeIds = saved.world.actors.hordes.filter(({ id }) => id.startsWith('event:')).map(({ id }) => id);
  expect(firedAt).toBeDefined();
  expect(hordeIds.length).toBeGreaterThan(0);

  const decoded = await decodeSave(
    await encodeSave(saved, {
      generation: 1,
      version,
      worldOptions: {
        blockSize: config.scale.blockSize,
        site: scenario.id,
        storeys: config.storeys,
        density: config.density,
      },
    }),
    { version, contentLookup: () => true },
  );
  const restored = createHoldout(decoded.snapshot);
  restored.session.sim.paused = false;
  restored.session.frame(1);
  expect(restored.setup.simulationWorld.getBlock(...placed)).toBe(content.registry.blockIds.get(wallBlock));
  const resumed = snapshot(restored.session);
  expect(resumed.character.scenarioRun!.eventsFiredAtGameTimestamp[rule.id]).toBe(firedAt);
  expect(resumed.world.actors.hordes.filter(({ id }) => id.startsWith('event:')).map(({ id }) => id)).toEqual(hordeIds);
});
