import { bundledModIdsFromUrl, selectBundledMods } from '@skelly/engine/packs';
import { configFromUrl, createSession, IDLE } from '@skelly/engine/session';
import { applyStartState } from '@skelly/engine/sim';
import { createWorldSetup, toChunk, type Vec3 } from '@skelly/engine/world';
import { ChunkMeshes } from '@skelly/presentation/render';
import { describe, expect, it } from 'vitest';
import pushLookManifest from '../mods/skelly.deadvox.scenario.test-house.furniture-push-look/pack/manifest.json' with {
  type: 'json',
};
import { productModIntake } from '../src/product/mods.ts';
import { ragdollSweepViewer } from '../src/product/ragdoll.ts';
import { stackActorFigureFiles } from './baseContentFiles.ts';
import { withReusedBuilds } from './bundledContentReuse.ts';
import { quietMesherSource } from './fixtures/quietMesherSource.ts';

const playLook = () => {
  const query = new URLSearchParams({ 'start-mod': pushLookManifest.id });
  const linked = withReusedBuilds(() =>
    selectBundledMods(productModIntake, bundledModIdsFromUrl(query), [], { form: 'id', id: pushLookManifest.id }),
  );
  if (linked.content.issues.length > 0) {
    throw new Error(JSON.stringify(linked.content.issues));
  }
  const config = configFromUrl(query, { debug: true }, linked.content, ragdollSweepViewer);
  const { registry } = linked.content;
  const setup = createWorldSetup(config, new ChunkMeshes(config.scale.blockSize, registry), quietMesherSource());
  const { canonicalTerrain: canonical, simulationWorld: simulation } = setup;
  const feet = setup.spawn.pos.map((value) => value / config.scale.blockSize) as Vec3;
  const solid = (x: number, y: number, z: number) => registry.blocks[canonical.getBlock(x, y, z)]!.solid;
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      simulation.arrive(toChunk(Math.floor(feet[0])) + dx, toChunk(Math.floor(feet[2])) + dz);
    }
  }
  const session = createSession({
    registry,
    actorFigureFiles: stackActorFigureFiles(registry),
    world: simulation,
    scale: config.scale,
    seed: config.seed,
    start: 43_200,
    spawn: feet,
    terrainDestruction: { terrain: canonical, source: setup },
    isSolid: solid,
    isOpaque: solid,
    ready: () => false,
    controls: {
      active: () => true,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
  });
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      session.onColumn(toChunk(Math.floor(feet[0])) + dx, toChunk(Math.floor(feet[2])) + dz, setup);
    }
  }
  applyStartState(session.inventory, registry.starts.get(config.startId)!, {
    fresh: true,
    character: session.character,
    body: session.sim.body,
    damageCell: session.damageTerrainCell,
    loseSupport: (cell) => simulation.support.lost(registry, cell),
  });
  return session;
};

describe('furniture push-off look as played', () => {
  it('pushes the heavy crate once from the raised floor to the ground', () => {
    const session = playLook();
    const crate = [...session.entities.all].find(({ type }) => type === 'furniture_push_look_crate')!;
    const [, before] = crate.pos;

    expect(session.liftFurniture(crate.uid)).toBeTruthy();
    expect(session.slideFurniture(crate.uid, 'push')).toBeUndefined();
    for (let frame = 0; frame < 120; frame++) {
      session.frame(1 / 60);
    }

    expect(crate.pos[1]).toBeLessThan(before);
  });
});
